import * as THREE from 'three';
import type { Identity } from 'spacetimedb';
import { NO_ISLAND } from '../../spacetimedb/src/logic/islands';
import { PLAYER_COLORS } from '../../spacetimedb/src/logic/players';
import { KeyboardMovement } from '../input/desktop';
import { TouchJoystick } from '../input/touch';
import type { DbConnection } from '../module_bindings';
import type { GameState, Piece, Player } from '../module_bindings/types';
import { Avatar } from '../scene/avatars';
import { PieceLayer } from '../scene/pieces';
import { decorateBeach, Effects } from '../scene/effects';
import { PlotLayer } from '../scene/plots';
import type { World } from '../scene/world';
import { ServerClock } from '../net/clock';
import { IslandSubscription } from '../net/island';
import { ActivityFeed } from '../ui/feed';
import { RoundHud } from '../ui/hud';
import { HomeScreen } from '../ui/home';
import { PlayerList } from '../ui/players';
import { playerCss } from '../ui/colors';
import { ResultsView } from '../ui/results';
import { tileToWorld } from '../../spacetimedb/src/logic/grid';
import { Toast } from '../ui/toast';
import { Builder } from './builder';
import { LocalPlayer } from './localPlayer';

function colorOf(p: Player): number {
  return PLAYER_COLORS[p.colorIndex % PLAYER_COLORS.length];
}

/**
 * Keeps the 3D scene and HUD in step with the subscribed SpacetimeDB tables. The
 * local player's own row says which island they are on; the game subscribes to that
 * island's rows and ignores anything left over from another island.
 */
export class Game {
  private readonly avatars = new Map<string, Avatar>();
  private readonly keyboard = new KeyboardMovement();
  private readonly joystick = new TouchJoystick();
  private readonly playerList = new PlayerList();
  private readonly home: HomeScreen;
  private readonly island: IslandSubscription;
  private readonly pieces: PieceLayer;
  private readonly builder: Builder;
  private readonly feed = new ActivityFeed();
  private readonly clock = new ServerClock();
  private readonly hud: RoundHud;
  private readonly results: ResultsView;
  private readonly plots: PlotLayer;
  private readonly toast = new Toast();
  private readonly effects: Effects;
  private readonly menuButton = document.getElementById('menu-button')!;
  private readonly myHex: string;
  private readonly followTarget = new THREE.Vector3();
  private local: LocalPlayer | null = null;

  constructor(
    private readonly world: World,
    private readonly conn: DbConnection,
    identity: Identity,
  ) {
    this.myHex = identity.toHexString();
    this.island = new IslandSubscription(conn, (m) => this.toast.show(m));
    // The main screen comes first; entering an island hides it.
    this.home = new HomeScreen(conn, this.myHex, this.toast, () =>
      this.showHome(false),
    );
    this.menuButton.addEventListener('click', () => this.showHome(true));
    this.pieces = new PieceLayer(world.scene);
    this.plots = new PlotLayer(world.scene);
    this.effects = new Effects(world.scene);
    decorateBeach(world.scene);
    this.builder = new Builder(
      world,
      conn,
      this.toast,
      () => this.local?.pos ?? null,
      this.myHex,
    );
    this.hud = new RoundHud(
      conn,
      this.clock,
      this.myHex,
      this.toast,
      async () => {
        await conn.reducers.startRound({});
      },
    );
    this.results = new ResultsView(conn, this.myHex);

    conn.db.piece.onInsert((_ctx, row) => this.onPiece(row));
    conn.db.piece.onUpdate((_ctx, _old, row) => this.onPiece(row));
    conn.db.piece.onDelete((_ctx, row) => {
      if (!this.here(row)) return;
      this.pieces.remove(row);
      this.hud.refresh();
    });

    conn.db.gameState.onInsert((_ctx, row) => this.onState(row));
    conn.db.gameState.onUpdate((_ctx, old, row) => this.onState(row, old));
    conn.db.gameState.onDelete(() => this.refreshRound());
    // Ballot, ideas, plots, and votes all feed the round card.
    const refresh = () => this.refreshRound();
    for (const table of [
      conn.db.idea,
      conn.db.themeVote,
      conn.db.plot,
      conn.db.plotVote,
    ]) {
      table.onInsert(refresh);
      table.onDelete(refresh);
    }
    conn.db.themeVote.onUpdate(refresh);
    conn.db.plotVote.onUpdate(refresh);
    conn.db.activity.onInsert((_ctx, event) => {
      if (!this.here(event)) return;
      this.feed.add(event);
      if (event.kind === 'placed' || event.kind === 'removed') {
        this.effects.puff(
          tileToWorld(event.tileX),
          tileToWorld(event.tileZ),
          playerCss(event.colorIndex),
        );
      }
    });

    conn.db.player.onInsert((_ctx, row) => this.onPlayer(row));
    conn.db.player.onUpdate((_ctx, old, row) => this.onPlayer(row, old));
    conn.db.player.onDelete((_ctx, row) => {
      this.removeAvatar(row.identity.toHexString());
      this.refreshList();
    });

    // A returning player is still on their island: go straight back in.
    const me = [...conn.db.player.iter()].find(
      (p) => p.identity.toHexString() === this.myHex,
    );
    if (me) this.onPlayer(me);
    this.showHome(!me || me.islandId === NO_ISLAND);
    this.refreshRound();
    this.refreshList();
  }

  update(dt: number): void {
    if (this.local) {
      const direction = this.joystick.active
        ? this.joystick.direction()
        : this.keyboard.direction();
      this.local.update(dt, direction, performance.now());
      this.avatars
        .get(this.myHex)
        ?.setTarget(this.local.pos.x, this.local.pos.z, this.local.heading);
    }
    for (const avatar of this.avatars.values()) avatar.update(dt);
    this.pieces.update(dt);
    this.effects.update(dt);
    this.builder.update();
    this.hud.tick();

    const me = this.avatars.get(this.myHex);
    this.world.follow(me ? this.followTarget.copy(me.root.position) : null, dt);
  }

  /** True for rows on the island the local player is on. */
  private here(row: { islandId: bigint }): boolean {
    return (
      this.island.current !== NO_ISLAND && row.islandId === this.island.current
    );
  }

  /** Switches the scene and subscription when the local player changes island. */
  private enterIsland(islandId: bigint): void {
    if (islandId === this.island.current) return;
    this.island.switchTo(islandId);
    // Clear the old island now; its rows are ignored until they leave the cache.
    this.pieces.clear();
    for (const hex of [...this.avatars.keys()]) this.removeAvatar(hex);
    this.local = null;
    this.builder.setEnabled(false);
    this.results.hide();
    if (islandId === NO_ISLAND) this.showHome(true);
    else this.menuButton.hidden = this.home.visible;
    this.refreshRound();
  }

  private onPiece(row: Piece): void {
    if (!this.here(row)) return;
    this.pieces.upsert(row);
    this.hud.refresh();
  }

  private onState(row: GameState, old?: GameState): void {
    if (!this.here(row)) return;
    if (!old || old.phase.tag !== row.phase.tag || old.round !== row.round) {
      // A fresh transition: its start time is a server timestamp from just now.
      if (old) this.clock.sample(row.phaseStartedAt.microsSinceUnixEpoch);
      this.results.onPhase(row.phase.tag, row.round, row.islandId);
    }
    this.refreshRound();
  }

  private onPlayer(row: Player, old?: Player): void {
    const hex = row.identity.toHexString();
    const isMe = hex === this.myHex;
    if (isMe) this.enterIsland(row.islandId);

    if (!row.online || !this.here(row)) {
      this.removeAvatar(hex);
      if (isMe) {
        this.local = null;
        this.builder.setEnabled(false);
      }
    } else {
      let avatar = this.avatars.get(hex);
      if (!avatar) {
        avatar = new Avatar(row.name, colorOf(row), isMe);
        avatar.snapTo(row.x, row.z, row.heading);
        this.world.scene.add(avatar.root);
        this.avatars.set(hex, avatar);
      } else {
        avatar.setLook(row.name, colorOf(row));
      }

      // A changed move time was stamped just now; a cached row's may be old.
      if (
        isMe &&
        old &&
        old.lastMoveAt.microsSinceUnixEpoch !==
          row.lastMoveAt.microsSinceUnixEpoch
      ) {
        this.clock.sample(row.lastMoveAt.microsSinceUnixEpoch);
      }
      if (!isMe) {
        avatar.setTarget(row.x, row.z, row.heading);
      } else if (!this.local) {
        this.local = new LocalPlayer(this.conn, row);
        this.builder.setEnabled(true);
      } else {
        this.local.reconcile(row);
      }
    }

    const listChanged =
      !old ||
      old.online !== row.online ||
      old.islandId !== row.islandId ||
      old.name !== row.name ||
      old.colorIndex !== row.colorIndex;
    if (listChanged) this.refreshList();
  }

  private removeAvatar(hex: string): void {
    this.avatars.get(hex)?.dispose();
    this.avatars.delete(hex);
  }

  private showHome(visible: boolean): void {
    if (visible) this.home.show();
    else this.home.hide();
    this.menuButton.hidden = visible || this.island.current === NO_ISLAND;
  }

  private refreshRound(): void {
    this.hud.refresh();
    const state =
      this.island.current === NO_ISLAND
        ? undefined
        : this.conn.db.gameState.islandId.find(this.island.current);
    const showPlots =
      state?.mode.tag === 'Battle' && state.phase.tag !== 'Lobby';
    this.plots.render(
      showPlots
        ? [...this.conn.db.plot.iter()].filter((p) => this.here(p))
        : null,
      this.myHex,
    );
  }

  private refreshList(): void {
    this.playerList.render(
      [...this.conn.db.player.iter()].filter((p) => this.here(p)),
      this.myHex,
      this.conn.db.island.id.find(this.island.current)?.name,
    );
  }
}
