import { boardOfPlot } from '../../spacetimedb/src/logic/plots';
import type { DbConnection } from '../module_bindings';
import { colorDot } from './colors';
import { errorMessage } from './dom';
import type { Toast } from './toast';

/**
 * Voting phase list: one row per build. Tapping a row shows that build on the island;
 * its Vote button picks it as the best (never your own).
 */
export class PlotVotePanel {
  /** The board being looked at; null shows the first build. */
  preview: number | null = null;
  private readonly list = document.getElementById('round-votes')!;

  constructor(
    private readonly conn: DbConnection,
    private readonly myHex: string,
    toast: Toast,
    onPreview: () => void,
  ) {
    this.list.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const vote = target.closest<HTMLButtonElement>('[data-vote]');
      if (vote) {
        if (vote.disabled) return;
        conn.reducers
          .votePlot({ plotIndex: Number(vote.dataset.vote) })
          .catch((err: unknown) => toast.show(errorMessage(err)));
        return;
      }
      const row = target.closest<HTMLButtonElement>('[data-board]');
      if (!row) return;
      this.preview = Number(row.dataset.board);
      this.render();
      onPreview();
    });
  }

  render(): void {
    const mine = [...this.conn.db.plotVote.iter()].find(
      (v) => v.voter.toHexString() === this.myHex,
    )?.plotIndex;
    const plots = [...this.conn.db.plot.iter()].sort(
      (a, b) => a.plotIndex - b.plotIndex,
    );
    const shown = this.preview ?? boardOfPlot(plots[0]?.plotIndex ?? 0);
    this.list.replaceChildren(
      ...plots.map((p) => {
        const own = p.builder.toHexString() === this.myHex;
        const board = boardOfPlot(p.plotIndex);
        const look = document.createElement('button');
        look.type = 'button';
        look.dataset.board = String(board);
        look.classList.toggle('looking', board === shown);
        const title = document.createElement('span');
        title.className = 'title';
        title.textContent = p.builderName;
        const tag = document.createElement('small');
        tag.textContent = board === shown ? 'on show' : 'tap to look';
        look.append(colorDot(p.colorIndex), title, tag);

        const vote = document.createElement('button');
        vote.type = 'button';
        vote.className = 'vote';
        vote.dataset.vote = String(p.plotIndex);
        vote.disabled = own;
        vote.classList.toggle('mine', p.plotIndex === mine);
        vote.textContent = own
          ? 'Yours'
          : p.plotIndex === mine
            ? 'Voted ✓'
            : 'Vote';

        const row = document.createElement('div');
        row.className = 'vote-row';
        row.append(look, vote);
        return row;
      }),
    );
  }
}
