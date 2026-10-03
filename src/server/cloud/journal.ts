import { type DatabaseSync, type Session } from 'node:sqlite';

// Schema is created before this session starts. The cloud runtime seals a new
// base after publication, so these deltas cover bounded operational progress.
// No SQL conflict is ignored on replay; that would silently lose evidence.
export class CheckpointJournal {
  private session: Session;
  private pending = false;
  private failed = false;
  constructor(private db: DatabaseSync) {
    this.session = db.createSession();
  }
  async checkpoint(commit: (bytes: Uint8Array) => Promise<void>) {
    if (this.pending || this.failed)
      throw new Error('Checkpoint journal unavailable');
    this.pending = true;
    try {
      const changes = this.session.changeset();
      this.session.close();
      this.session = this.db.createSession();
      if (changes.byteLength) await commit(changes);
    } catch (error) {
      // The remote commit may have succeeded. The execution must stop; recovery
      // uses authoritative control state, never this ambiguous local copy.
      this.failed = true;
      throw error;
    } finally {
      this.pending = false;
    }
  }
  close() {
    this.session.close();
  }
}

export function replayCheckpoint(db: DatabaseSync, bytes: Uint8Array) {
  if (!db.applyChangeset(bytes)) throw new Error('Checkpoint replay conflict');
}
