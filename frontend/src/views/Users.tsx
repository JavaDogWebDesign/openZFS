import { useState, useEffect } from "react";
import {
  listSystemUsers,
  createSystemUser,
  deleteSystemUser,
  changeSystemPassword,
  listGroups,
  createGroup,
  deleteGroup,
  addUserToGroup,
  removeUserFromGroup,
  listSmbUsers,
  addSmbUser,
  removeSmbUser,
  changeSmbPassword,
  listSmbShares,
  updateShareAccess,
  lockAccount,
  changeShell,
  listShells,
  renameGroup,
  type SystemUser,
  type SystemGroup,
  type SmbUser,
  type SmbShareInfo,
} from "@/lib/api";
import { useApi, useMutation } from "@/hooks/useApi";
import { useToast } from "@/components/Toast";
import { AdvancedOptions } from "@/components/AdvancedOptions";
import {
  Users as UsersIcon,
  UserPlus,
  Trash2,
  KeyRound,
  Shield,
  Share2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  X,
  Plus,
  Lock,
  Unlock,
  Terminal,
  Pencil,
} from "lucide-react";
import s from "@/styles/views.module.css";

function passwordStrength(pw: string): { score: number; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const color = score <= 1 ? "var(--color-danger)" : score <= 2 ? "var(--color-warning)" : "var(--color-success)";
  return { score, color };
}

function PasswordStrengthBar({ password }: { password: string }) {
  if (!password) return null;
  const { score, color } = passwordStrength(password);
  return (
    <div style={{ height: 4, background: "var(--color-border)", borderRadius: 2, marginTop: 4, width: "100%" }}>
      <div style={{ height: 4, borderRadius: 2, background: color, width: `${(score / 4) * 100}%`, transition: "width 0.2s, background 0.2s" }} />
    </div>
  );
}

export function Users() {
  const { addToast } = useToast();

  // --- System Users ---
  const { data: systemUsers, loading: usersLoading, refetch: refetchUsers } =
    useApi(() => listSystemUsers(), []);

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [enableSmb, setEnableSmb] = useState(true);
  const [smbPasswordOverride, setSmbPasswordOverride] = useState("");
  const [newSmbShares, setNewSmbShares] = useState<string[]>([]);
  const [changePwUser, setChangePwUser] = useState<string | null>(null);
  const [changePwValue, setChangePwValue] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [shellEditUser, setShellEditUser] = useState<string | null>(null);
  const [shellEditValue, setShellEditValue] = useState("");
  const [availableShells, setAvailableShells] = useState<string[]>([]);

  const createUserMutation = useMutation(
    (username: string, password: string, fullName: string, smbPassword?: string, smbShares?: string[]) =>
      createSystemUser(username, password, fullName, smbPassword, smbShares),
  );
  const deleteUserMutation = useMutation(
    (username: string, confirm: string) => deleteSystemUser(username, confirm),
  );
  const changePasswordMutation = useMutation(
    (username: string, password: string) => changeSystemPassword(username, password),
  );
  const lockAccountMutation = useMutation(
    (username: string, locked: boolean) => lockAccount(username, locked),
  );
  const changeShellMutation = useMutation(
    (username: string, shell: string) => changeShell(username, shell),
  );

  useEffect(() => {
    listShells().then(setAvailableShells).catch(() => {});
  }, []);

  // --- Groups ---
  const { data: groups, loading: groupsLoading, refetch: refetchGroups } =
    useApi(() => listGroups(), []);

  const [newGroupName, setNewGroupName] = useState("");
  const [deleteGroupConfirm, setDeleteGroupConfirm] = useState<string | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [addMemberUser, setAddMemberUser] = useState("");
  const [renameGroupName, setRenameGroupName] = useState<string | null>(null);
  const [renameGroupValue, setRenameGroupValue] = useState("");

  const createGroupMutation = useMutation((name: string) => createGroup(name));
  const deleteGroupMutation = useMutation(
    (name: string, confirm: string) => deleteGroup(name, confirm),
  );
  const addToGroupMutation = useMutation(
    (username: string, group: string) => addUserToGroup(username, group),
  );
  const removeFromGroupMutation = useMutation(
    (username: string, group: string) => removeUserFromGroup(username, group),
  );
  const renameGroupMutation = useMutation(
    (name: string, newName: string) => renameGroup(name, newName),
  );

  // --- SMB Users ---
  const { data: smbUsers, refetch: refetchSmbUsers } =
    useApi(() => listSmbUsers(), []);

  const [smbChangePwUser, setSmbChangePwUser] = useState<string | null>(null);
  const [smbChangePwValue, setSmbChangePwValue] = useState("");

  const addSmbUserMutation = useMutation(
    (username: string, password: string) => addSmbUser(username, password),
  );
  const removeSmbUserMutation = useMutation((username: string) => removeSmbUser(username));
  const changeSmbPwMutation = useMutation(
    (username: string, password: string) => changeSmbPassword(username, password),
  );

  // --- Share Access ---
  const { data: smbShares, loading: sharesLoading, refetch: refetchShares } =
    useApi(() => listSmbShares(), []);

  const [editingShare, setEditingShare] = useState<string | null>(null);
  const [editingValidUsers, setEditingValidUsers] = useState("");

  const updateAccessMutation = useMutation(
    (shareName: string, validUsers: string) => updateShareAccess(shareName, validUsers),
  );

  // --- Helpers ---

  const isSmbUser = (username: string): boolean => {
    return smbUsers?.some((u: SmbUser) => u.username === username) ?? false;
  };

  // --- Handlers ---

  const handleRefresh = () => {
    refetchUsers();
    refetchGroups();
    refetchSmbUsers();
    refetchShares();
  };

  const handleCreateUser = async () => {
    if (!newUsername || !newPassword) return;
    const smbPw = enableSmb ? (smbPasswordOverride || newPassword) : undefined;
    const shares = enableSmb ? newSmbShares : undefined;
    const result = await createUserMutation.execute(newUsername, newPassword, newFullName, smbPw, shares);
    if (result) {
      const msg = enableSmb
        ? `User '${newUsername}' created with file sharing enabled`
        : `User '${newUsername}' created`;
      addToast("success", msg);
      setNewUsername("");
      setNewPassword("");
      setNewFullName("");
      setSmbPasswordOverride("");
      setNewSmbShares([]);
    } else if (createUserMutation.error) {
      addToast("error", createUserMutation.error);
    }
    refetchUsers();
    refetchSmbUsers();
  };

  const handleDeleteUser = async (username: string) => {
    const result = await deleteUserMutation.execute(username, username);
    if (result) {
      addToast("success", `User '${username}' deleted`);
      setDeleteConfirm(null);
    } else if (deleteUserMutation.error) {
      addToast("error", deleteUserMutation.error);
    }
    refetchUsers();
    refetchSmbUsers();
  };

  const handleChangePassword = async () => {
    if (!changePwUser || !changePwValue) return;
    const result = await changePasswordMutation.execute(changePwUser, changePwValue);
    if (result) {
      addToast("success", `Password changed for '${changePwUser}'`);
      setChangePwUser(null);
      setChangePwValue("");
    } else if (changePasswordMutation.error) {
      addToast("error", changePasswordMutation.error);
    }
  };

  const handleLockToggle = async (username: string, currentlyLocked: boolean) => {
    const result = await lockAccountMutation.execute(username, !currentlyLocked);
    if (result) {
      addToast("success", `Account '${username}' ${currentlyLocked ? "unlocked" : "locked"}`);
    } else if (lockAccountMutation.error) {
      addToast("error", lockAccountMutation.error);
    }
    refetchUsers();
  };

  const handleChangeShell = async (username: string) => {
    if (!shellEditValue) return;
    const result = await changeShellMutation.execute(username, shellEditValue);
    if (result) {
      addToast("success", `Shell changed for '${username}'`);
      setShellEditUser(null);
      setShellEditValue("");
    } else if (changeShellMutation.error) {
      addToast("error", changeShellMutation.error);
    }
    refetchUsers();
  };

  const handleRenameGroup = async (name: string) => {
    if (!renameGroupValue || renameGroupValue === name) return;
    const result = await renameGroupMutation.execute(name, renameGroupValue);
    if (result) {
      addToast("success", `Group '${name}' renamed to '${renameGroupValue}'`);
      setRenameGroupName(null);
      setRenameGroupValue("");
    } else if (renameGroupMutation.error) {
      addToast("error", renameGroupMutation.error);
    }
    refetchGroups();
  };

  const handleCreateGroup = async () => {
    if (!newGroupName) return;
    const result = await createGroupMutation.execute(newGroupName);
    if (result) {
      addToast("success", `Group '${newGroupName}' created`);
      setNewGroupName("");
    } else if (createGroupMutation.error) {
      addToast("error", createGroupMutation.error);
    }
    refetchGroups();
  };

  const handleDeleteGroup = async (name: string) => {
    const result = await deleteGroupMutation.execute(name, name);
    if (result) {
      addToast("success", `Group '${name}' deleted`);
      setDeleteGroupConfirm(null);
    } else if (deleteGroupMutation.error) {
      addToast("error", deleteGroupMutation.error);
    }
    refetchGroups();
  };

  const handleAddMember = async (group: string) => {
    if (!addMemberUser) return;
    const result = await addToGroupMutation.execute(addMemberUser, group);
    if (result) {
      addToast("success", `Added '${addMemberUser}' to '${group}'`);
      setAddMemberUser("");
    } else if (addToGroupMutation.error) {
      addToast("error", addToGroupMutation.error);
    }
    refetchGroups();
  };

  const handleRemoveMember = async (username: string, group: string) => {
    const result = await removeFromGroupMutation.execute(username, group);
    if (result) {
      addToast("success", `Removed '${username}' from '${group}'`);
    } else if (removeFromGroupMutation.error) {
      addToast("error", removeFromGroupMutation.error);
    }
    refetchGroups();
  };

  const handleEnableSmb = async (username: string) => {
    const pw = prompt(`Set SMB password for '${username}':`);
    if (!pw) return;
    const result = await addSmbUserMutation.execute(username, pw);
    if (result) {
      addToast("success", `SMB enabled for '${username}'`);
      refetchSmbUsers();
    } else if (addSmbUserMutation.error) {
      addToast("error", addSmbUserMutation.error);
    }
  };

  const handleRemoveSmbUser = async (username: string) => {
    const result = await removeSmbUserMutation.execute(username);
    if (result) {
      addToast("success", `SMB disabled for '${username}'`);
      refetchSmbUsers();
    } else if (removeSmbUserMutation.error) {
      addToast("error", removeSmbUserMutation.error);
    }
  };

  const handleChangeSmbPassword = async () => {
    if (!smbChangePwUser || !smbChangePwValue) return;
    const result = await changeSmbPwMutation.execute(smbChangePwUser, smbChangePwValue);
    if (result) {
      addToast("success", `SMB password changed for '${smbChangePwUser}'`);
      setSmbChangePwUser(null);
      setSmbChangePwValue("");
    } else if (changeSmbPwMutation.error) {
      addToast("error", changeSmbPwMutation.error);
    }
  };

  const handleUpdateAccess = async (shareName: string) => {
    const result = await updateAccessMutation.execute(shareName, editingValidUsers);
    if (result) {
      addToast("success", `Updated access for '${shareName}'`);
      setEditingShare(null);
      setEditingValidUsers("");
      refetchShares();
    } else if (updateAccessMutation.error) {
      addToast("error", updateAccessMutation.error);
    }
  };

  const thStyle: React.CSSProperties = {
    padding: "var(--space-2) var(--space-3)",
    fontSize: "var(--text-xs)",
    color: "var(--color-text-muted)",
    textTransform: "uppercase",
  };
  const tdStyle: React.CSSProperties = { padding: "var(--space-3)" };

  return (
    <div>
      <div className={s.header}>
        <h1 className={s.title}>Users & Access</h1>
        <div className={s.actions}>
          <button className={s.btnGhost} onClick={handleRefresh}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Card 1: System Users (with merged SMB column) */}
      <div className={s.card}>
        <h2 className={s.cardTitle}>
          <UsersIcon size={16} style={{ marginRight: "var(--space-2)", verticalAlign: "middle" }} />
          System Users
        </h2>

        {usersLoading ? (
          <div className={s.loading}>Loading system users...</div>
        ) : !systemUsers || systemUsers.length === 0 ? (
          <div className={s.empty}>
            <UsersIcon size={24} style={{ marginBottom: "var(--space-2)", opacity: 0.5 }} />
            <div>No system users found (UID &ge; 1000).</div>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "var(--space-3)" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left" }}>
                <th style={thStyle}>Username</th>
                <th style={thStyle}>Full Name</th>
                <th style={thStyle}>UID</th>
                <th style={thStyle}>SMB</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {systemUsers.map((u: SystemUser) => {
                const hasSMB = isSmbUser(u.username);
                return (
                  <tr key={u.username} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td className={s.mono} style={tdStyle}>{u.username}</td>
                    <td style={tdStyle}>
                      {u.full_name || <span style={{ color: "var(--color-text-dim)" }}>—</span>}
                    </td>
                    <td className={s.mono} style={tdStyle}>{u.uid}</td>
                    <td style={tdStyle}>
                      {hasSMB ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--color-accent)", background: "var(--color-accent-dim)", padding: "2px 8px", borderRadius: "var(--radius-sm)" }}>
                          SMB
                        </span>
                      ) : (
                        <button
                          className={s.btnGhost}
                          onClick={() => handleEnableSmb(u.username)}
                          disabled={addSmbUserMutation.loading}
                          style={{ fontSize: "var(--text-xs)", padding: "2px 8px" }}
                        >
                          Enable SMB
                        </button>
                      )}
                    </td>
                    <td style={tdStyle}>
                      {u.locked ? (
                        <span className={s.badgeDanger} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <Lock size={10} /> Locked
                        </span>
                      ) : (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-success)", display: "inline-block" }} />
                          Active
                        </span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
                        {changePwUser === u.username ? (
                          <>
                            <div>
                              <input className={s.input} type="password" placeholder="New password" value={changePwValue} onChange={(e) => setChangePwValue(e.target.value)} style={{ width: 160 }} />
                              <PasswordStrengthBar password={changePwValue} />
                            </div>
                            <button className={s.btnPrimary} onClick={handleChangePassword} disabled={changePasswordMutation.loading || !changePwValue} style={{ padding: "var(--space-1) var(--space-2)", fontSize: "var(--text-xs)" }}>
                              {changePasswordMutation.loading ? "..." : "Save"}
                            </button>
                            <button className={s.btnGhost} onClick={() => { setChangePwUser(null); setChangePwValue(""); }} style={{ padding: "var(--space-1) var(--space-2)", fontSize: "var(--text-xs)" }}>Cancel</button>
                          </>
                        ) : smbChangePwUser === u.username ? (
                          <>
                            <div>
                              <input className={s.input} type="password" placeholder="New SMB password" value={smbChangePwValue} onChange={(e) => setSmbChangePwValue(e.target.value)} style={{ width: 160 }} />
                              <PasswordStrengthBar password={smbChangePwValue} />
                            </div>
                            <button className={s.btnPrimary} onClick={handleChangeSmbPassword} disabled={changeSmbPwMutation.loading || !smbChangePwValue} style={{ padding: "var(--space-1) var(--space-2)", fontSize: "var(--text-xs)" }}>
                              {changeSmbPwMutation.loading ? "..." : "Save"}
                            </button>
                            <button className={s.btnGhost} onClick={() => { setSmbChangePwUser(null); setSmbChangePwValue(""); }} style={{ padding: "var(--space-1) var(--space-2)", fontSize: "var(--text-xs)" }}>Cancel</button>
                          </>
                        ) : deleteConfirm === u.username ? (
                          <>
                            <span style={{ fontSize: "var(--text-xs)", color: "var(--color-danger)" }}>Delete {u.username}?</span>
                            <button className={s.btnDanger} onClick={() => handleDeleteUser(u.username)} disabled={deleteUserMutation.loading} style={{ padding: "var(--space-1) var(--space-2)", fontSize: "var(--text-xs)" }}>
                              {deleteUserMutation.loading ? "..." : "Confirm"}
                            </button>
                            <button className={s.btnGhost} onClick={() => setDeleteConfirm(null)} style={{ padding: "var(--space-1) var(--space-2)", fontSize: "var(--text-xs)" }}>Cancel</button>
                          </>
                        ) : shellEditUser === u.username ? (
                          <>
                            <select className={s.select} value={shellEditValue} onChange={(e) => setShellEditValue(e.target.value)} style={{ fontSize: "var(--text-xs)" }}>
                              {availableShells.map((sh) => (
                                <option key={sh} value={sh}>{sh}</option>
                              ))}
                            </select>
                            <button className={s.btnPrimary} onClick={() => handleChangeShell(u.username)} disabled={changeShellMutation.loading || !shellEditValue} style={{ padding: "var(--space-1) var(--space-2)", fontSize: "var(--text-xs)" }}>
                              {changeShellMutation.loading ? "..." : "Save"}
                            </button>
                            <button className={s.btnGhost} onClick={() => { setShellEditUser(null); setShellEditValue(""); }} style={{ padding: "var(--space-1) var(--space-2)", fontSize: "var(--text-xs)" }}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button className={s.btnGhost} onClick={() => { setChangePwUser(u.username); setChangePwValue(""); }} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <KeyRound size={12} /> Password
                            </button>
                            {hasSMB && (
                              <button className={s.btnGhost} onClick={() => { setSmbChangePwUser(u.username); setSmbChangePwValue(""); }} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <KeyRound size={12} /> SMB PW
                              </button>
                            )}
                            <button className={s.btnGhost} onClick={() => { setShellEditUser(u.username); setShellEditValue(u.shell); }} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <Terminal size={12} /> Shell
                            </button>
                            <button className={s.btnGhost} onClick={() => handleLockToggle(u.username, u.locked)} disabled={lockAccountMutation.loading} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              {u.locked ? <><Unlock size={12} /> Unlock</> : <><Lock size={12} /> Lock</>}
                            </button>
                            {hasSMB && (
                              <button className={s.btnGhost} onClick={() => handleRemoveSmbUser(u.username)} disabled={removeSmbUserMutation.loading} style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--color-text-muted)" }}>
                                <Share2 size={12} /> Disable SMB
                              </button>
                            )}
                            <button className={s.btnDanger} onClick={() => setDeleteConfirm(u.username)} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <Trash2 size={12} /> Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Create user form */}
        <div style={{ paddingTop: "var(--space-3)", borderTop: "1px solid var(--color-border)" }}>
          <h3 style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "var(--space-2)" }}>
            <UserPlus size={14} style={{ marginRight: "var(--space-1)", verticalAlign: "middle" }} />
            Create User
          </h3>
          {createUserMutation.error && (
            <div className={s.error} style={{ marginBottom: "var(--space-2)" }}>{createUserMutation.error}</div>
          )}
          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Username</label>
              <input className={s.input} placeholder="e.g. alice" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Password</label>
              <input className={s.input} type="password" placeholder="Password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              <PasswordStrengthBar password={newPassword} />
            </div>
            <button className={s.btnPrimary} onClick={handleCreateUser} disabled={createUserMutation.loading || !newUsername || !newPassword}>
              {createUserMutation.loading ? "Creating..." : "Create User"}
            </button>
          </div>

          {/* Enable file sharing checkbox */}
          <div style={{ marginTop: "var(--space-3)" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", cursor: "pointer" }}>
              <input type="checkbox" checked={enableSmb} onChange={(e) => setEnableSmb(e.target.checked)} />
              Enable file sharing (SMB)
            </label>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-dim)", marginTop: "var(--space-1)", paddingLeft: "var(--space-5)" }}>
              Uses the same password for SMB access. Uncheck to create a system-only user.
            </div>
          </div>

          {/* Share access checkboxes when SMB enabled */}
          {enableSmb && smbShares && smbShares.length > 0 && (
            <div style={{ marginTop: "var(--space-3)", paddingLeft: "var(--space-5)" }}>
              <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Grant access to shares</label>
              <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
                {smbShares.map((share: SmbShareInfo) => (
                  <label key={share.share_name} style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", fontSize: "var(--text-sm)", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={newSmbShares.includes(share.share_name)}
                      onChange={(e) => {
                        if (e.target.checked) setNewSmbShares((prev) => [...prev, share.share_name]);
                        else setNewSmbShares((prev) => prev.filter((n) => n !== share.share_name));
                      }}
                    />
                    <span className={s.mono}>{share.share_name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Advanced: Full Name, Shell */}
          <div style={{ marginTop: "var(--space-3)" }}>
            <AdvancedOptions>
              <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginBottom: "var(--space-2)" }}>
                <div>
                  <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Full Name</label>
                  <input className={s.input} placeholder="Alice Smith" value={newFullName} onChange={(e) => setNewFullName(e.target.value)} />
                </div>
                {enableSmb && (
                  <div>
                    <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>SMB Password (if different)</label>
                    <input className={s.input} type="password" placeholder="Same as above" value={smbPasswordOverride} onChange={(e) => setSmbPasswordOverride(e.target.value)} />
                  </div>
                )}
              </div>
            </AdvancedOptions>
          </div>
        </div>
      </div>

      {/* Card 2: System Groups */}
      <div className={s.card}>
        <h2 className={s.cardTitle}>
          <Shield size={16} style={{ marginRight: "var(--space-2)", verticalAlign: "middle" }} />
          System Groups
        </h2>

        {groupsLoading ? (
          <div className={s.loading}>Loading groups...</div>
        ) : !groups || groups.length === 0 ? (
          <div className={s.empty}>
            <Shield size={24} style={{ marginBottom: "var(--space-2)", opacity: 0.5 }} />
            <div>No groups found.</div>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "var(--space-3)" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left" }}>
                <th style={thStyle}>Group</th>
                <th style={thStyle}>GID</th>
                <th style={thStyle}>Members</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g: SystemGroup) => {
                const isExpanded = expandedGroup === g.name;
                return (
                  <tr key={g.name} style={{ borderBottom: "1px solid var(--color-border)", verticalAlign: "top" }}>
                    <td className={s.mono} style={tdStyle}>{g.name}</td>
                    <td className={s.mono} style={tdStyle}>{g.gid}</td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: "var(--space-1)", flexWrap: "wrap", alignItems: "center" }}>
                        {g.members.length === 0 ? (
                          <span style={{ color: "var(--color-text-dim)", fontSize: "var(--text-xs)" }}>No members</span>
                        ) : (
                          g.members.map((m) => (
                            <span key={m} className={s.badgeMuted} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                              {m}
                              {isExpanded && (
                                <button onClick={() => handleRemoveMember(m, g.name)} disabled={removeFromGroupMutation.loading} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--color-danger)", display: "inline-flex" }} title={`Remove ${m} from ${g.name}`}>
                                  <X size={10} />
                                </button>
                              )}
                            </span>
                          ))
                        )}
                      </div>
                      {isExpanded && (
                        <div style={{ marginTop: "var(--space-2)", display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
                          <select className={s.select} value={addMemberUser} onChange={(e) => setAddMemberUser(e.target.value)} style={{ fontSize: "var(--text-xs)" }}>
                            <option value="">Add user...</option>
                            {systemUsers?.filter((u: SystemUser) => !g.members.includes(u.username)).map((u: SystemUser) => (
                              <option key={u.username} value={u.username}>{u.username}</option>
                            ))}
                          </select>
                          <button className={s.btnPrimary} onClick={() => handleAddMember(g.name)} disabled={addToGroupMutation.loading || !addMemberUser} style={{ padding: "var(--space-1) var(--space-2)", fontSize: "var(--text-xs)" }}>
                            <Plus size={10} /> Add
                          </button>
                        </div>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
                        {deleteGroupConfirm === g.name ? (
                          <>
                            <span style={{ fontSize: "var(--text-xs)", color: "var(--color-danger)" }}>Delete {g.name}?</span>
                            <button className={s.btnDanger} onClick={() => handleDeleteGroup(g.name)} disabled={deleteGroupMutation.loading} style={{ padding: "var(--space-1) var(--space-2)", fontSize: "var(--text-xs)" }}>
                              {deleteGroupMutation.loading ? "..." : "Confirm"}
                            </button>
                            <button className={s.btnGhost} onClick={() => setDeleteGroupConfirm(null)} style={{ padding: "var(--space-1) var(--space-2)", fontSize: "var(--text-xs)" }}>Cancel</button>
                          </>
                        ) : renameGroupName === g.name ? (
                          <>
                            <input className={s.input} value={renameGroupValue} onChange={(e) => setRenameGroupValue(e.target.value)} style={{ width: 140, fontSize: "var(--text-xs)" }} placeholder="New group name" />
                            <button className={s.btnPrimary} onClick={() => handleRenameGroup(g.name)} disabled={renameGroupMutation.loading || !renameGroupValue || renameGroupValue === g.name} style={{ padding: "var(--space-1) var(--space-2)", fontSize: "var(--text-xs)" }}>
                              {renameGroupMutation.loading ? "..." : "Save"}
                            </button>
                            <button className={s.btnGhost} onClick={() => { setRenameGroupName(null); setRenameGroupValue(""); }} style={{ padding: "var(--space-1) var(--space-2)", fontSize: "var(--text-xs)" }}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button className={s.btnGhost} onClick={() => { setExpandedGroup(isExpanded ? null : g.name); setAddMemberUser(""); }} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Members
                            </button>
                            <button className={s.btnGhost} onClick={() => { setRenameGroupName(g.name); setRenameGroupValue(g.name); }} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <Pencil size={12} /> Rename
                            </button>
                            <button className={s.btnDanger} onClick={() => setDeleteGroupConfirm(g.name)} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <Trash2 size={12} /> Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Create group form */}
        <div style={{ paddingTop: "var(--space-3)", borderTop: "1px solid var(--color-border)" }}>
          <h3 style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "var(--space-2)" }}>Create Group</h3>
          {createGroupMutation.error && (
            <div className={s.error} style={{ marginBottom: "var(--space-2)" }}>{createGroupMutation.error}</div>
          )}
          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-end" }}>
            <div>
              <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>Group Name</label>
              <input className={s.input} placeholder="e.g. developers" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} />
            </div>
            <button className={s.btnPrimary} onClick={handleCreateGroup} disabled={createGroupMutation.loading || !newGroupName}>
              {createGroupMutation.loading ? "Creating..." : "Create Group"}
            </button>
          </div>
        </div>
      </div>

      {/* Card 3: Share Access */}
      <div className={s.card}>
        <h2 className={s.cardTitle}>
          <Share2 size={16} style={{ marginRight: "var(--space-2)", verticalAlign: "middle" }} />
          Share Access
        </h2>

        {sharesLoading ? (
          <div className={s.loading}>Loading SMB shares...</div>
        ) : !smbShares || smbShares.length === 0 ? (
          <div className={s.empty}>
            <Share2 size={24} style={{ marginBottom: "var(--space-2)", opacity: 0.5 }} />
            <div>No SMB shares configured. Share a dataset via SMB on the Sharing page.</div>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left" }}>
                <th style={thStyle}>Share Name</th>
                <th style={thStyle}>Path</th>
                <th style={thStyle}>Valid Users</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {smbShares.map((share: SmbShareInfo) => (
                <tr key={share.share_name} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td className={s.mono} style={tdStyle}>{share.share_name}</td>
                  <td className={s.mono} style={tdStyle}>{share.path}</td>
                  <td style={tdStyle}>
                    {editingShare === share.share_name ? (
                      <input className={s.input} value={editingValidUsers} onChange={(e) => setEditingValidUsers(e.target.value)} placeholder="alice bob @staff" style={{ width: "100%", minWidth: 200 }} />
                    ) : (
                      <span className={s.mono} style={{ fontSize: "var(--text-sm)" }}>
                        {share.valid_users || <span style={{ color: "var(--color-text-dim)" }}>No restriction</span>}
                      </span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    {editingShare === share.share_name ? (
                      <div style={{ display: "flex", gap: "var(--space-2)" }}>
                        <button className={s.btnPrimary} onClick={() => handleUpdateAccess(share.share_name)} disabled={updateAccessMutation.loading} style={{ padding: "var(--space-1) var(--space-2)", fontSize: "var(--text-xs)" }}>
                          {updateAccessMutation.loading ? "..." : "Save"}
                        </button>
                        <button className={s.btnGhost} onClick={() => { setEditingShare(null); setEditingValidUsers(""); }} style={{ padding: "var(--space-1) var(--space-2)", fontSize: "var(--text-xs)" }}>Cancel</button>
                      </div>
                    ) : (
                      <button className={s.btnGhost} onClick={() => { setEditingShare(share.share_name); setEditingValidUsers(share.valid_users); }} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <KeyRound size={12} /> Edit Access
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ marginTop: "var(--space-3)", background: "var(--color-bg-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
          Use space-separated usernames and @group names. Example: <code className={s.mono}>alice bob @staff</code>.
        </div>
      </div>
    </div>
  );
}
