import type { DbConnection } from '../module_bindings';
import { colorDot } from './colors';
import type { Toast } from './toast';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Voting phase list: one button per built plot; your own plot cannot be chosen. */
export class PlotVotePanel {
  private readonly list = document.getElementById('round-votes')!;

  constructor(
    private readonly conn: DbConnection,
    private readonly myHex: string,
    toast: Toast,
  ) {
    this.list.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>(
        '[data-plot]',
      );
      if (!button || button.disabled) return;
      conn.reducers
        .votePlot({ plotIndex: Number(button.dataset.plot) })
        .catch((err: unknown) => toast.show(errorMessage(err)));
    });
  }

  render(): void {
    const mine = [...this.conn.db.plotVote.iter()].find(
      (v) => v.voter.toHexString() === this.myHex,
    )?.plotIndex;
    const plots = [...this.conn.db.plot.iter()].sort(
      (a, b) => a.plotIndex - b.plotIndex,
    );
    this.list.replaceChildren(
      ...plots.map((p) => {
        const own = p.builder.toHexString() === this.myHex;
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.plot = String(p.plotIndex);
        button.disabled = own;
        button.classList.toggle('mine', p.plotIndex === mine);
        const title = document.createElement('span');
        title.className = 'title';
        title.textContent = p.builderName;
        const tag = document.createElement('small');
        tag.textContent = own
          ? 'your build'
          : p.plotIndex === mine
            ? 'your vote ✓'
            : 'vote';
        button.append(colorDot(p.colorIndex), title, tag);
        return button;
      }),
    );
  }
}
