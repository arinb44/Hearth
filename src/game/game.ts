import * as THREE from 'three';
import type { Identity } from 'spacetimedb';
import { PLAYER_COLORS } from '../../spacetimedb/src/logic/players';
import { KeyboardMovement } from '../input/desktop';
import type { DbConnection } from '../module_bindings';
import type { Player } from '../module_bindings/types';
import { Avatar } from '../scene/avatars';
import { PieceLayer } from '../scene/pieces';
import type { World } from '../scene/world';
import { ActivityFeed } from '../ui/feed';
import { JoinScreen } from '../ui/join';
import { PlayerList } from '../ui/players';
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
    this.builder = new Builder(
      world,
      conn,
      new Toast(),
      () => this.local?.pos ?? null,
    );

    conn.db.piece.onInsert((_ctx, row) => this.pieces.upsert(row));
    conn.db.piece.onUpdate((_ctx, _old, row) => this.pieces.upsert(row));
    conn.db.piece.onDelete((_ctx, row) => this.pieces.remove(row));
    for (const row of conn.db.piece.iter()) this.pieces.upsert(row);
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

  private refreshList(): void {
    this.playerList.render(this.conn.db.player.iter(), this.myHex);
  }
}
