// Represents the locking scripts used in BTC locking.
export interface LockingScripts {
  timelockScript: Buffer;
  unbondingScript: Buffer;
  slashingScript: Buffer;
  unbondingTimelockScript: Buffer;
  provablyNoteScript: Buffer;
}
