import { ChangeDetectionStrategy, Component, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface Procedure {
    id: string;
    title: string;
    lastUse: string;
    running: number;
    archived: number;
}

type SortField = 'id' | 'title' | 'lastUse' | 'running' | 'archived';

@Component({
    selector: 'app-procedure-table',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule],
    templateUrl: './procedure-table.html',
    styleUrl: './procedure-table.scss',
})
export class ProcedureTableComponent {
    /** The raw list of procedures (empty = no backend hooked up yet) */
    protected procedures = signal<Procedure[]>([]);

    /** Search query bound to the search input */
    protected searchQuery = signal('');

    /** Sort state */
    protected sortField = signal<SortField>('id');
    protected sortReverse = signal(false);

    /** Derived: filtered then sorted procedure list */
    protected filteredProcedures = computed(() => {
        const query = this.searchQuery().toLowerCase().trim();
        const list = query
            ? this.procedures().filter(p => p.title.toLowerCase().includes(query))
            : [...this.procedures()];

        const field = this.sortField();
        const reverse = this.sortReverse();

        list.sort((a, b) => {
            const aVal = a[field];
            const bVal = b[field];
            if (typeof aVal === 'string' && typeof bVal === 'string') {
                return aVal.localeCompare(bVal);
            }
            return (aVal as number) - (bVal as number);
        });

        if (reverse) list.reverse();
        return list;
    });

    protected onSearchInput(value: string): void {
        this.searchQuery.set(value);
    }

    protected toggleSort(field: SortField): void {
        if (this.sortField() === field) {
            this.sortReverse.update(r => !r);
        } else {
            this.sortField.set(field);
            this.sortReverse.set(false);
        }
    }
}
