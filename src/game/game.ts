import * as THREE from 'three';
import type { Identity } from 'spacetimedb';
import { PLAYER_COLORS } from '../../spacetimedb/src/logic/players';
import { KeyboardMovement } from '../input/desktop';
import type { DbConnection } from '../module_bindings';
import type { Player } from '../module_bindings/types';
import { Avatar } from '../scene/avatars';
import { PieceLayer } from '../scene/pieces';
import { PlotLayer } from '../scene/plots';
import type { World } from '../scene/world';
import { ServerClock } from '../net/clock';
import { ActivityFeed } from '../ui/feed';
import { RoundHud } from '../ui/hud';
import { JoinScreen } from '../ui/join';
import { PlayerList } from '../ui/players';
import { ResultsView } from '../ui/results';
import { Toast } from '../ui/toast';
import { Builder } from './builder';
import { LocalPlayer } from './localPlayer';

function colorOf(p: Player): number {
  return PLAYER_COLORS[p.colorIndex % PLAYER_COLORS.length];
}

/** Keeps the 3D scene and HUD in step with the subscribed SpacetimeDB tables. */
export class Game {
  private readonly avatars = new Map<string, Avatar>();
  private readonly keyboard = new KeyboardMovement();
  private readonly playerList = new PlayerList();
  private readonly joinScreen: JoinScreen;
  private readonly pieces: PieceLayer;
  private readonly builder: Builder;
  private readonly feed = new ActivityFeed();
  private readonly clock = new ServerClock();
  private readonly hud: RoundHud;
  private readonly results: ResultsView;
  private readonly plots: PlotLayer;
  private readonly toast = new Toast();
  private readonly myHex: string;
  private readonly followTarget = new THREE.Vector3();
  private local: LocalPlayer | null = null;

  constructor(
    private readonly world: World,
    private readonly conn: DbConnection,
    identity: Identity,
  ) {
    this.myHex = identity.toHexString();
    this.joinScreen = new JoinScreen(async (name) => {
      await conn.reducers.join({ name });
    });
    this.pieces = new PieceLayer(world.scene);
    this.plots = new PlotLayer(world.scene);
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
    this.results = new ResultsView(conn);

    conn.db.piece.onInsert((_ctx, row) => {
      this.pieces.upsert(row);
      this.hud.refresh();
    });
    conn.db.piece.onUpdate((_ctx, _old, row) => this.pieces.upsert(row));
    conn.db.piece.onDelete((_ctx, row) => {
      this.pieces.remove(row);
      this.hud.refresh();
    });
    for (const row of conn.db.piece.iter()) this.pieces.upsert(row);

    conn.db.gameState.onUpdate((_ctx, old, row) => {
      if (old.phase.tag !== row.phase.tag || old.round !== row.round) {
        // A fresh transition: its start time is a server timestamp from just now.
        this.clock.sample(row.phaseStartedAt.microsSinceUnixEpoch);
        this.results.onPhase(row.phase.tag, row.round);
      }
      this.refreshRound();
    });
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
    this.refreshRound();
    const initial = conn.db.gameState.id.find(0);
    if (initial) this.results.onPhase(initial.phase.tag, initial.round);
    conn.db.activity.onInsert((_ctx, event) => this.feed.add(event));

    conn.db.player.onInsert((_ctx, row) => this.onPlayer(row));
    conn.db.player.onUpdate((_ctx, old, row) => this.onPlayer(row, old));
    conn.db.player.onDelete((_ctx, row) => {
      this.removeAvatar(row.identity.toHexString());
      this.refreshList();
    });
    for (const row of conn.db.player.iter()) this.onPlayer(row);

    // Returning players (stored token) are already in the table and skip the prompt.
    if (!this.local) this.joinScreen.show();
    this.refreshList();
  }

  update(dt: number): void {
    if (this.local) {
      this.local.update(dt, this.keyboard.direction(), performance.now());
      this.avatars
        .get(this.myHex)
        ?.setTarget(this.local.pos.x, this.local.pos.z, this.local.heading);
    }
    for (const avatar of this.avatars.values()) avatar.update(dt);
    this.pieces.update(dt);
    this.builder.update();
    this.hud.tick();

    const me = this.avatars.get(this.myHex);
    this.world.follow(me ? this.followTarget.copy(me.root.position) : null, dt);
  }

  private onPlayer(row: Player, old?: Player): void {
    const hex = row.identity.toHexString();
    const isMe = hex === this.myHex;

    if (!row.online) {
      this.removeAvatar(hex);
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

      if (
        isMe &&
        (!old ||
          old.lastMoveAt.microsSinceUnixEpoch !==
            row.lastMoveAt.microsSinceUnixEpoch)
      ) {
        this.clock.sample(row.lastMoveAt.microsSinceUnixEpoch);
      }
      if (!isMe) {
        avatar.setTarget(row.x, row.z, row.heading);
      } else if (!this.local) {
        this.local = new LocalPlayer(this.conn, row);
        this.joinScreen.hide();
        this.builder.setEnabled(true);
      } else {
        this.local.reconcile(row);
      }
    }

    const listChanged =
      !old ||
      old.online !== row.online ||
      old.name !== row.name ||
      old.colorIndex !== row.colorIndex;
    if (listChanged) this.refreshList();
  }

  private removeAvatar(hex: string): void {
    this.avatars.get(hex)?.dispose();
    this.avatars.delete(hex);
  }

  private refreshRound(): void {
    this.hud.refresh();
    const state = this.conn.db.gameState.id.find(0);
    const showPlots =
      state?.mode.tag === 'Battle' && state.phase.tag !== 'Lobby';
    this.plots.render(
      showPlots ? [...this.conn.db.plot.iter()] : null,
      this.myHex,
    );
  }

  private refreshList(): void {
    this.playerList.render(this.conn.db.player.iter(), this.myHex);
  }
}
