import { type FormEvent, useCallback, useState } from "react";
import {
  listReplicationJobs,
  createReplicationJob,
  deleteReplicationJob,
  listDatasets,
  listSnapshots,
  type ReplicationJob,
  type DatasetSummary,
} from "@/lib/api";
import { useApi, useMutation } from "@/hooks/useApi";
import { useToast } from "@/components/Toast";
import { formatBytes } from "@/lib/format";
import {
  Plus,
  Trash2,
  ArrowRight,
  RefreshCw,
  Send,
  Clock,
  X,
  ChevronDown,
} from "lucide-react";
import s from "@/styles/views.module.css";

interface JobFormState {
  name: string;
  source: string;
  destination: string;
  direction: "local" | "ssh";
  ssh_host: string;
  ssh_user: string;
  recursive: boolean;
  raw_send: boolean;
  compressed: boolean;
  schedule: string;
}

const emptyForm: JobFormState = {
  name: "",
  source: "",
  destination: "",
  direction: "local",
  ssh_host: "",
  ssh_user: "",
  recursive: true,
  raw_send: false,
  compressed: true,
  schedule: "",
};

function formatTimestamp(ts: number | null): string {
  if (!ts) return "Never";
  return new Date(ts * 1000).toLocaleString();
}

function statusBadge(status: string | null): string {
  if (!status) return s.badgeMuted;
  const lower = status.toLowerCase();
  if (lower === "success" || lower === "ok") return s.badgeSuccess;
  if (lower === "running" || lower === "pending") return s.badgeWarning;
  return s.badgeDanger;
}

export function Replication() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<JobFormState>(emptyForm);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Send state
  const [sendDataset, setSendDataset] = useState("");
  const [sendSnapshot, setSendSnapshot] = useState("");
  const [sendDest, setSendDest] = useState("");
  const [sendIncremental, setSendIncremental] = useState("");

  const {
    data: jobs,
    loading: jobsLoading,
    error: jobsError,
    refetch: refetchJobs,
  } = useApi(() => listReplicationJobs(), []);

  const {
    data: datasets,
    loading: datasetsLoading,
  } = useApi(() => listDatasets(), []);

  const {
    data: snapshots,
  } = useApi(
    () => (sendDataset ? listSnapshots(sendDataset) : Promise.resolve([])),
    [sendDataset],
  );

  const { addToast } = useToast();

  const createMutation = useMutation(
    (body: Parameters<typeof createReplicationJob>[0]) =>
      createReplicationJob(body),
  );

  const deleteMutation = useMutation((id: string) =>
    deleteReplicationJob(id),
  );

  const sendMutation = useMutation(
    (body: Parameters<typeof createReplicationJob>[0]) =>
      createReplicationJob(body),
  );

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const result = await createMutation.execute({
      name: form.name,
      source: form.source,
      destination: form.destination,
      direction: form.direction,
      ssh_host: form.direction === "ssh" ? form.ssh_host : undefined,
      ssh_user: form.direction === "ssh" ? form.ssh_user : undefined,
      recursive: form.recursive,
      raw_send: form.raw_send,
      compressed: form.compressed,
      schedule: form.schedule || undefined,
    });
    if (result) {
      addToast("success", `Replication job "${form.name}" created`);
      setForm(emptyForm);
      setShowForm(false);
      refetchJobs();
    } else if (createMutation.error) {
      addToast("error", createMutation.error);
    }
  };

  const handleDelete = async (id: string) => {
    const result = await deleteMutation.execute(id);
    if (result) {
      addToast("success", "Replication job deleted");
      setConfirmDelete(null);
      refetchJobs();
    } else if (deleteMutation.error) {
      addToast("error", deleteMutation.error);
    }
  };

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!sendSnapshot || !sendDest) return;
    const snapshotDataset = sendSnapshot.split("@")[0] || sendDataset;
    const result = await sendMutation.execute({
      name: `manual-send-${Date.now()}`,
      source: snapshotDataset,
      destination: sendDest,
    });
    if (result) {
      setSendSnapshot("");
      setSendDest("");
      setSendIncremental("");
      refetchJobs();
    }
  };

  const updateForm = useCallback(
    <K extends keyof JobFormState>(key: K, value: JobFormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  if (jobsLoading && datasetsLoading) {
    return <div className={s.loading}>Loading replication data...</div>;
  }

  return (
    <div>
      <div className={s.header}>
        <h1 className={s.title}>Replication</h1>
        <div className={s.actions}>
          <button className={s.btnGhost} onClick={refetchJobs}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button
            className={s.btnPrimary}
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? (
              <>
                <X size={14} /> Cancel
              </>
            ) : (
              <>
                <Plus size={14} /> New Job
              </>
            )}
          </button>
        </div>
      </div>

      {jobsError && <div className={s.error}>{jobsError}</div>}
      {createMutation.error && (
        <div className={s.error}>{createMutation.error}</div>
      )}
      {deleteMutation.error && (
        <div className={s.error}>{deleteMutation.error}</div>
      )}

      {/* New Job Form */}
      {showForm && (
        <div className={s.card}>
          <h2 className={s.cardTitle}>Create Replication Job</h2>
          <form onSubmit={handleCreate}>
            <div className={s.grid2} style={{ marginBottom: "var(--space-4)" }}>
              <div>
                <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-sm)" }}>
                  Job Name
                </label>
                <input
                  className={s.select}
                  style={{ width: "100%" }}
                  value={form.name}
                  onChange={(e) => updateForm("name", e.target.value)}
                  placeholder="my-backup-job"
                  required
                />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-sm)" }}>
                  Direction
                </label>
                <select
                  className={s.select}
                  style={{ width: "100%" }}
                  value={form.direction}
                  onChange={(e) =>
                    updateForm(
                      "direction",
                      e.target.value as "local" | "ssh",
                    )
                  }
                >
                  <option value="local">Local</option>
                  <option value="ssh">SSH (Remote)</option>
                </select>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-dim)", marginTop: 2 }}>
                  Local copies data between pools on this machine. SSH sends data to a remote server.
                </div>
              </div>
            </div>

            <div className={s.grid2} style={{ marginBottom: "var(--space-4)" }}>
              <div>
                <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-sm)" }}>
                  Source Dataset
                </label>
                <select
                  className={s.select}
                  style={{ width: "100%" }}
                  value={form.source}
                  onChange={(e) => updateForm("source", e.target.value)}
                  required
                >
                  <option value="">Select source...</option>
                  {datasets?.map((ds: DatasetSummary) => (
                    <option key={ds.name} value={ds.name}>
                      {ds.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-sm)" }}>
                  Destination
                </label>
                <input
                  className={s.select}
                  style={{ width: "100%" }}
                  value={form.destination}
                  onChange={(e) => updateForm("destination", e.target.value)}
                  placeholder="pool/backup/target"
                  required
                />
              </div>
            </div>

            {form.direction === "ssh" && (
              <div
                className={s.grid2}
                style={{ marginBottom: "var(--space-4)" }}
              >
                <div>
                  <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-sm)" }}>
                    SSH Host
                  </label>
                  <input
                    className={s.select}
                    style={{ width: "100%" }}
                    value={form.ssh_host}
                    onChange={(e) => updateForm("ssh_host", e.target.value)}
                    placeholder="backup-server.example.com"
                    required
                  />
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-sm)" }}>
                    SSH User
                  </label>
                  <input
                    className={s.select}
                    style={{ width: "100%" }}
                    value={form.ssh_user}
                    onChange={(e) => updateForm("ssh_user", e.target.value)}
                    placeholder="root"
                    required
                  />
                </div>
              </div>
            )}

            <div className={s.grid2} style={{ marginBottom: "var(--space-4)" }}>
              <div>
                <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-sm)" }}>
                  Schedule (cron expression)
                </label>
                <input
                  className={s.select}
                  style={{ width: "100%" }}
                  value={form.schedule}
                  onChange={(e) => updateForm("schedule", e.target.value)}
                  placeholder="0 2 * * * (daily at 2 AM)"
                />
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-dim)", marginTop: 2 }}>
                  Format: minute hour day month weekday. Examples: <code>0 2 * * *</code> = daily 2 AM, <code>0 */6 * * *</code> = every 6 hours, <code>0 3 * * 0</code> = Sunday 3 AM. Leave empty for manual-only.
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", paddingBottom: "var(--space-2)" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)" }}>
                  <input
                    type="checkbox"
                    checked={form.recursive}
                    onChange={(e) => updateForm("recursive", e.target.checked)}
                  />
                  Recursive
                </label>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-dim)", marginLeft: 22 }}>Include all child datasets in the replication</div>
                <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)" }}>
                  <input
                    type="checkbox"
                    checked={form.raw_send}
                    onChange={(e) => updateForm("raw_send", e.target.checked)}
                  />
                  Raw Send
                </label>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-dim)", marginLeft: 22 }}>Send encrypted data as-is without decrypting (required for encrypted datasets)</div>
                <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)" }}>
                  <input
                    type="checkbox"
                    checked={form.compressed}
                    onChange={(e) => updateForm("compressed", e.target.checked)}
                  />
                  Compressed
                </label>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-dim)", marginLeft: 22 }}>Send data in compressed form to save bandwidth</div>
              </div>
            </div>

            <div className={s.actions}>
              <button
                className={s.btnPrimary}
                type="submit"
                disabled={createMutation.loading}
              >
                <Plus size={14} />
                {createMutation.loading ? "Creating..." : "Create Job"}
              </button>
              <button
                className={s.btnGhost}
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setForm(emptyForm);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Replication Jobs */}
      {jobsLoading ? (
        <div className={s.loading}>Loading jobs...</div>
      ) : !jobs?.length ? (
        <div className={s.empty}>
          No replication jobs configured. Click "New Job" to create one.
        </div>
      ) : (
        jobs.map((job: ReplicationJob) => (
          <div className={s.card} key={job.id}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: "var(--space-3)",
              }}
            >
              <div>
                <h3 className={s.cardTitle} style={{ marginBottom: "var(--space-1)" }}>
                  {job.name}
                </h3>
                <div
                  className={s.mono}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
                    color: "var(--color-text-muted)",
                  }}
                >
                  {job.source}
                  <ArrowRight size={12} />
                  {job.destination}
                  {job.direction === "ssh" && (
                    <span className={s.badgeMuted}>
                      SSH: {job.ssh_user}@{job.ssh_host}
                    </span>
                  )}
                </div>
              </div>
              <div className={s.actions}>
                <span className={statusBadge(job.last_status)}>
                  {job.last_status ?? "Never run"}
                </span>
                {confirmDelete === job.id ? (
                  <>
                    <button
                      className={s.btnDanger}
                      onClick={() => handleDelete(job.id)}
                      disabled={deleteMutation.loading}
                    >
                      {deleteMutation.loading ? "Deleting..." : "Confirm"}
                    </button>
                    <button
                      className={s.btnGhost}
                      onClick={() => setConfirmDelete(null)}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    className={s.btnDanger}
                    onClick={() => setConfirmDelete(job.id)}
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                )}
              </div>
            </div>

            <div className={s.grid4}>
              <div className={s.stat}>
                <div className={s.statLabel}>Schedule</div>
                <div className={s.statValue} style={{ fontSize: "var(--text-sm)" }}>
                  <Clock size={12} style={{ marginRight: "var(--space-1)" }} />
                  {job.schedule || "Manual"}
                </div>
              </div>
              <div className={s.stat}>
                <div className={s.statLabel}>Last Run</div>
                <div className={s.statValue} style={{ fontSize: "var(--text-sm)" }}>
                  {formatTimestamp(job.last_run)}
                </div>
              </div>
              <div className={s.stat}>
                <div className={s.statLabel}>Last Transfer</div>
                <div className={s.statValue} style={{ fontSize: "var(--text-sm)" }}>
                  {formatBytes(job.last_bytes)}
                </div>
              </div>
              <div className={s.stat}>
                <div className={s.statLabel}>Options</div>
                <div
                  style={{
                    display: "flex",
                    gap: "var(--space-1)",
                    flexWrap: "wrap",
                    marginTop: "var(--space-1)",
                  }}
                >
                  {job.recursive === 1 && (
                    <span className={s.badgeMuted}>Recursive</span>
                  )}
                  {job.raw_send === 1 && (
                    <span className={s.badgeMuted}>Raw</span>
                  )}
                  {job.compressed === 1 && (
                    <span className={s.badgeMuted}>Compressed</span>
                  )}
                  {job.enabled === 1 ? (
                    <span className={s.badgeSuccess}>Enabled</span>
                  ) : (
                    <span className={s.badgeWarning}>Disabled</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))
      )}

      {/* Manual Send */}
      <div className={s.card} style={{ marginTop: "var(--space-6)" }}>
        <h2 className={s.cardTitle}>
          <Send size={16} style={{ marginRight: "var(--space-2)" }} />
          Manual Send
        </h2>
        {sendMutation.error && (
          <div className={s.error} style={{ marginBottom: "var(--space-3)" }}>
            {sendMutation.error}
          </div>
        )}
        <form onSubmit={handleSend}>
          <div className={s.grid2} style={{ marginBottom: "var(--space-4)" }}>
            <div>
              <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-sm)" }}>
                Dataset
              </label>
              <select
                className={s.select}
                style={{ width: "100%" }}
                value={sendDataset}
                onChange={(e) => {
                  setSendDataset(e.target.value);
                  setSendSnapshot("");
                  setSendIncremental("");
                }}
              >
                <option value="">Select dataset...</option>
                {datasets?.map((ds: DatasetSummary) => (
                  <option key={ds.name} value={ds.name}>
                    {ds.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-sm)" }}>
                Snapshot
                <ChevronDown
                  size={12}
                  style={{ marginLeft: "var(--space-1)" }}
                />
              </label>
              <select
                className={s.select}
                style={{ width: "100%" }}
                value={sendSnapshot}
                onChange={(e) => setSendSnapshot(e.target.value)}
                disabled={!sendDataset}
              >
                <option value="">
                  {sendDataset ? "Select snapshot..." : "Select dataset first"}
                </option>
                {snapshots?.map((snap) => (
                  <option key={snap.name} value={snap.name}>
                    {snap.name} ({snap.used}, {snap.creation})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={s.grid2} style={{ marginBottom: "var(--space-4)" }}>
            <div>
              <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-sm)" }}>
                Destination
              </label>
              <input
                className={s.select}
                style={{ width: "100%" }}
                value={sendDest}
                onChange={(e) => setSendDest(e.target.value)}
                placeholder="pool/backup/target"
                required
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-sm)" }}>
                Incremental Source (optional)
              </label>
              <select
                className={s.select}
                style={{ width: "100%" }}
                value={sendIncremental}
                onChange={(e) => setSendIncremental(e.target.value)}
                disabled={!sendDataset}
              >
                <option value="">Full send (no incremental)</option>
                {snapshots
                  ?.filter((snap) => snap.name !== sendSnapshot)
                  .map((snap) => (
                    <option key={snap.name} value={snap.name}>
                      {snap.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <button
            className={s.btnPrimary}
            type="submit"
            disabled={sendMutation.loading || !sendSnapshot || !sendDest}
          >
            <Send size={14} />
            {sendMutation.loading ? "Sending..." : "Send Snapshot"}
          </button>
        </form>
      </div>
    </div>
  );
}
