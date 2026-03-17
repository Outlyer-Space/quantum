/** Shared step type used in Preview and ViewProcedure components */
export type StepType = 'string' | 'alert' | 'decision' | 'input' | 'command' | 'verify';

/**
 * A single step within a procedure.
 * Replaces both `PreviewStep` and `ProcedureStep` with a single strict model.
 */
export interface ProcedureStep {
    id: string;
    level: 1 | 2 | 3;
    role: string;
    type: StepType;
    content: string;
    flatIndex: number; // The flat array index required by the backend /setInfo endpoint
    referenceUrl?: string;
    isOpen: boolean;
    children?: ProcedureStep[];

    /** Only applicable when type === 'input' */
    recordedValue?: string;
    inputValue?: string;
}

/** Raw backend row from MongoDB sections array */
export interface RawSection {
    Step: string;
    Role: string;
    Type: string;
    Content: string;
    Reference?: string;
}

/** Raw backend instance from MongoDB instances array */
export interface RawInstance {
    openedBy: string;
    closedBy: string;
    startedAt: string;
    completedAt: string;
    revision: number;
    running: boolean;
    version: number;
    Steps: { step: string; info: string; recordedValue?: string; comments?: string }[];
    users: { name: string; email: string; status: string }[];
}

/** Raw backend procedure document from MongoDB */
export interface RawProcedure {
    _id: string;
    procedureID: string;
    title: string;
    eventname: string;
    lastuse: string;
    sections: RawSection[];
    instances: RawInstance[];
    versions: RawSection[][];
}

/** A running (open) instance of a procedure */
export interface ProcedureInstance {
    id: string;
    revision: number;
    version: number;
    openedBy: string;
    startedAt: string;
}

/** An archived (completed) instance of a procedure */
export interface ArchivedInstance extends ProcedureInstance {
    closedBy: string;
    completedAt: string;
}

/** Frontend-friendly procedure summary for the dashboard table */
export interface ProcedureSummary {
    id: string;
    title: string;
    lastUse: string;
    running: number;
    archived: number;
    /** Mission (eventname) this procedure belongs to */
    eventname: string;
}

/** Wrapper returned by the service for a full procedure */
export interface ProcedureData {
    id: string;
    title: string;
    steps: ProcedureStep[];
    eventname?: string;
}
