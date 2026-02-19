import { useState } from "react";
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
  type SystemUser,
  type SystemGroup,
  type SmbUser,
  type SmbShareInfo,
} from "@/lib/api";
import { useApi, useMutation } from "@/hooks/useApi";
import { useToast } from "@/components/Toast";
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
} from "lucide-react";
import s from "@/styles/views.module.css";

export function Users() {
  const { addToast } = useToast();

  // --- System Users ---
  const { data: systemUsers, loading: usersLoading, refetch: refetchUsers } =
    useApi(() => listSystemUsers(), []);

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [changePwUser, setChangePwUser] = useState<string | null>(null);
  const [changePwValue, setChangePwValue] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleteConfirmValue, setDeleteConfirmValue] = useState("");

  const createUserMutation = useMutation(
    (username: string, password: string, fullName: string) =>
      createSystemUser(username, password, fullName),
  );
  const deleteUserMutation = useMutation(
    (username: string, confirm: string) => deleteSystemUser(username, confirm),
  );
  const changePasswordMutation = useMutation(
    (username: string, password: string) => changeSystemPassword(username, password),
  );

  // --- Groups ---
  const { data: groups, loading: groupsLoading, refetch: refetchGroups } =
    useApi(() => listGroups(), []);

  const [newGroupName, setNewGroupName] = useState("");
  const [deleteGroupConfirm, setDeleteGroupConfirm] = useState<string | null>(null);
  const [deleteGroupConfirmValue, setDeleteGroupConfirmValue] = useState("");
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [addMemberUser, setAddMemberUser] = useState("");

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

  // --- SMB Users ---
  const { data: smbUsers, loading: smbUsersLoading, refetch: refetchSmbUsers } =
    useApi(() => listSmbUsers(), []);

  const [newSmbUsername, setNewSmbUsername] = useState("");
  const [newSmbPassword, setNewSmbPassword] = useState("");
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

  // --- Handlers ---

  const handleRefresh = () => {
    refetchUsers();
    refetchGroups();
    refetchSmbUsers();
    refetchShares();
  };

  const handleCreateUser = async () => {
    if (!newUsername || !newPassword) return;
    const result = await createUserMutation.execute(newUsername, newPassword, newFullName);
    if (result) {
      addToast("success", `User '${newUsername}' created`);
      setNewUsername("");
      setNewPassword("");
      setNewFullName("");
    } else if (createUserMutation.error) {
      addToast("error", createUserMutation.error);
    }
    // Always refetch — useradd may partially succeed (e.g. user created but mail spool failed)
    refetchUsers();
  };

  const handleDeleteUser = async (username: string) => {
    if (deleteConfirmValue !== username) return;
    const result = await deleteUserMutation.execute(username, deleteConfirmValue);
    if (result) {
      addToast("success", `User '${username}' deleted`);
      setDeleteConfirm(null);
      setDeleteConfirmValue("");
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
    if (deleteGroupConfirmValue !== name) return;
    const result = await deleteGroupMutation.execute(name, deleteGroupConfirmValue);
    if (result) {
      addToast("success", `Group '${name}' deleted`);
      setDeleteGroupConfirm(null);
      setDeleteGroupConfirmValue("");
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

  const handleAddSmbUser = async () => {
    if (!newSmbUsername || !newSmbPassword) return;
    const result = await addSmbUserMutation.execute(newSmbUsername, newSmbPassword);
    if (result) {
      addToast("success", `SMB user '${newSmbUsername}' added`);
      setNewSmbUsername("");
      setNewSmbPassword("");
      refetchSmbUsers();
    } else if (addSmbUserMutation.error) {
      addToast("error", addSmbUserMutation.error);
    }
  };

  const handleRemoveSmbUser = async (username: string) => {
    const result = await removeSmbUserMutation.execute(username);
    if (result) {
      addToast("success", `SMB user '${username}' removed`);
      refetchSmbUsers();
    } else if (removeSmbUserMutation.error) {
      addToast("error", removeSmbUserMutation.error);
    }
  };

  const handleChangeSmbPassword = async () => {
    if (!smbChangePwUser || !smbChangePwValue) return;
    const result = await changeSmbPwMutation.execute(smbChangePwUser, smbChangePwValue);
    if (result) {
      addToast("success", `Password changed for SMB user '${smbChangePwUser}'`);
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

      {/* Card 1: System Users */}
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
                <th style={thStyle}>Home</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {systemUsers.map((u: SystemUser) => (
                <tr key={u.username} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td className={s.mono} style={tdStyle}>{u.username}</td>
                  <td style={tdStyle}>
                    {u.full_name || <span style={{ color: "var(--color-text-dim)" }}>—</span>}
                  </td>
                  <td className={s.mono} style={tdStyle}>{u.uid}</td>
                  <td className={s.mono} style={tdStyle}>{u.home}</td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
                      {changePwUser === u.username ? (
                        <>
                          <input
                            className={s.input}
                            type="password"
                            placeholder="New password"
                            value={changePwValue}
                            onChange={(e) => setChangePwValue(e.target.value)}
                            style={{ width: 160 }}
                          />
                          <button
                            className={s.btnPrimary}
                            onClick={handleChangePassword}
                            disabled={changePasswordMutation.loading || !changePwValue}
                            style={{ padding: "var(--space-1) var(--space-2)", fontSize: "var(--text-xs)" }}
                          >
                            {changePasswordMutation.loading ? "..." : "Save"}
                          </button>
                          <button
                            className={s.btnGhost}
                            onClick={() => { setChangePwUser(null); setChangePwValue(""); }}
                            style={{ padding: "var(--space-1) var(--space-2)", fontSize: "var(--text-xs)" }}
                          >
                            Cancel
                          </button>
                        </>
                      ) : deleteConfirm === u.username ? (
                        <>
                          <input
                            className={s.input}
                            placeholder={`Type "${u.username}" to confirm`}
                            value={deleteConfirmValue}
                            onChange={(e) => setDeleteConfirmValue(e.target.value)}
                            style={{ width: 200 }}
                          />
                          <button
                            className={s.btnDanger}
                            onClick={() => handleDeleteUser(u.username)}
                            disabled={deleteUserMutation.loading || deleteConfirmValue !== u.username}
                            style={{ padding: "var(--space-1) var(--space-2)", fontSize: "var(--text-xs)" }}
                          >
                            {deleteUserMutation.loading ? "..." : "Confirm Delete"}
                          </button>
                          <button
                            className={s.btnGhost}
                            onClick={() => { setDeleteConfirm(null); setDeleteConfirmValue(""); }}
                            style={{ padding: "var(--space-1) var(--space-2)", fontSize: "var(--text-xs)" }}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className={s.btnGhost}
                            onClick={() => { setChangePwUser(u.username); setChangePwValue(""); }}
                            style={{ display: "flex", alignItems: "center", gap: 4 }}
                          >
                            <KeyRound size={12} /> Password
                          </button>
                          <button
                            className={s.btnDanger}
                            onClick={() => { setDeleteConfirm(u.username); setDeleteConfirmValue(""); }}
                            style={{ display: "flex", alignItems: "center", gap: 4 }}
                          >
                            <Trash2 size={12} /> Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
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
              <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                Username
              </label>
              <input
                className={s.input}
                placeholder="e.g. alice"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                Password
              </label>
              <input
                className={s.input}
                type="password"
                placeholder="Password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                Full Name (optional)
              </label>
              <input
                className={s.input}
                placeholder="Alice Smith"
                value={newFullName}
                onChange={(e) => setNewFullName(e.target.value)}
              />
            </div>
            <button
              className={s.btnPrimary}
              onClick={handleCreateUser}
              disabled={createUserMutation.loading || !newUsername || !newPassword}
            >
              {createUserMutation.loading ? "Creating..." : "Create User"}
            </button>
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
                                <button
                                  onClick={() => handleRemoveMember(m, g.name)}
                                  disabled={removeFromGroupMutation.loading}
                                  style={{
                                    background: "none",
                                    border: "none",
                                    cursor: "pointer",
                                    padding: 0,
                                    color: "var(--color-danger)",
                                    display: "inline-flex",
                                  }}
                                  title={`Remove ${m} from ${g.name}`}
                                >
                                  <X size={10} />
                                </button>
                              )}
                            </span>
                          ))
                        )}
                      </div>
                      {isExpanded && (
                        <div style={{ marginTop: "var(--space-2)", display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
                          <select
                            className={s.select}
                            value={addMemberUser}
                            onChange={(e) => setAddMemberUser(e.target.value)}
                            style={{ fontSize: "var(--text-xs)" }}
                          >
                            <option value="">Add user...</option>
                            {systemUsers
                              ?.filter((u: SystemUser) => !g.members.includes(u.username))
                              .map((u: SystemUser) => (
                                <option key={u.username} value={u.username}>{u.username}</option>
                              ))}
                          </select>
                          <button
                            className={s.btnPrimary}
                            onClick={() => handleAddMember(g.name)}
                            disabled={addToGroupMutation.loading || !addMemberUser}
                            style={{ padding: "var(--space-1) var(--space-2)", fontSize: "var(--text-xs)" }}
                          >
                            <Plus size={10} /> Add
                          </button>
                        </div>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
                        {deleteGroupConfirm === g.name ? (
                          <>
                            <input
                              className={s.input}
                              placeholder={`Type "${g.name}"`}
                              value={deleteGroupConfirmValue}
                              onChange={(e) => setDeleteGroupConfirmValue(e.target.value)}
                              style={{ width: 140 }}
                            />
                            <button
                              className={s.btnDanger}
                              onClick={() => handleDeleteGroup(g.name)}
                              disabled={deleteGroupMutation.loading || deleteGroupConfirmValue !== g.name}
                              style={{ padding: "var(--space-1) var(--space-2)", fontSize: "var(--text-xs)" }}
                            >
                              {deleteGroupMutation.loading ? "..." : "Confirm"}
                            </button>
                            <button
                              className={s.btnGhost}
                              onClick={() => { setDeleteGroupConfirm(null); setDeleteGroupConfirmValue(""); }}
                              style={{ padding: "var(--space-1) var(--space-2)", fontSize: "var(--text-xs)" }}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className={s.btnGhost}
                              onClick={() => {
                                setExpandedGroup(isExpanded ? null : g.name);
                                setAddMemberUser("");
                              }}
                              style={{ display: "flex", alignItems: "center", gap: 4 }}
                            >
                              {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                              Members
                            </button>
                            <button
                              className={s.btnDanger}
                              onClick={() => { setDeleteGroupConfirm(g.name); setDeleteGroupConfirmValue(""); }}
                              style={{ display: "flex", alignItems: "center", gap: 4 }}
                            >
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
          <h3 style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "var(--space-2)" }}>
            Create Group
          </h3>
          {createGroupMutation.error && (
            <div className={s.error} style={{ marginBottom: "var(--space-2)" }}>{createGroupMutation.error}</div>
          )}
          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-end" }}>
            <div>
              <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                Group Name
              </label>
              <input
                className={s.input}
                placeholder="e.g. developers"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
              />
            </div>
            <button
              className={s.btnPrimary}
              onClick={handleCreateGroup}
              disabled={createGroupMutation.loading || !newGroupName}
            >
              {createGroupMutation.loading ? "Creating..." : "Create Group"}
            </button>
          </div>
        </div>
      </div>

      {/* Card 3: SMB Users */}
      <div className={s.card}>
        <h2 className={s.cardTitle}>
          <UsersIcon size={16} style={{ marginRight: "var(--space-2)", verticalAlign: "middle" }} />
          SMB Users
        </h2>

        <div
          style={{
            background: "var(--color-bg-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            padding: "var(--space-2) var(--space-3)",
            fontSize: "var(--text-xs)",
            color: "var(--color-text-muted)",
            marginBottom: "var(--space-3)",
          }}
        >
          Samba maintains its own user database separate from system (PAM) users.
          Users must exist as system users before they can be added as SMB users.
        </div>

        {smbUsersLoading ? (
          <div className={s.loading}>Loading SMB users...</div>
        ) : !smbUsers || smbUsers.length === 0 ? (
          <div className={s.empty}>
            <UsersIcon size={24} style={{ marginBottom: "var(--space-2)", opacity: 0.5 }} />
            <div>No Samba users configured.</div>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "var(--space-3)" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left" }}>
                <th style={thStyle}>Username</th>
                <th style={thStyle}>Full Name</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {smbUsers.map((u: SmbUser) => (
                <tr key={u.username} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td className={s.mono} style={tdStyle}>{u.username}</td>
                  <td style={tdStyle}>
                    {u.full_name || <span style={{ color: "var(--color-text-dim)" }}>—</span>}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
                      {smbChangePwUser === u.username ? (
                        <>
                          <input
                            className={s.input}
                            type="password"
                            placeholder="New password"
                            value={smbChangePwValue}
                            onChange={(e) => setSmbChangePwValue(e.target.value)}
                            style={{ width: 160 }}
                          />
                          <button
                            className={s.btnPrimary}
                            onClick={handleChangeSmbPassword}
                            disabled={changeSmbPwMutation.loading || !smbChangePwValue}
                            style={{ padding: "var(--space-1) var(--space-2)", fontSize: "var(--text-xs)" }}
                          >
                            {changeSmbPwMutation.loading ? "..." : "Save"}
                          </button>
                          <button
                            className={s.btnGhost}
                            onClick={() => { setSmbChangePwUser(null); setSmbChangePwValue(""); }}
                            style={{ padding: "var(--space-1) var(--space-2)", fontSize: "var(--text-xs)" }}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className={s.btnGhost}
                            onClick={() => { setSmbChangePwUser(u.username); setSmbChangePwValue(""); }}
                            style={{ display: "flex", alignItems: "center", gap: 4 }}
                          >
                            <KeyRound size={12} /> Password
                          </button>
                          <button
                            className={s.btnDanger}
                            onClick={() => handleRemoveSmbUser(u.username)}
                            disabled={removeSmbUserMutation.loading}
                            style={{ display: "flex", alignItems: "center", gap: 4 }}
                          >
                            <Trash2 size={12} /> {removeSmbUserMutation.loading ? "..." : "Remove"}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Add SMB User form */}
        <div style={{ paddingTop: "var(--space-3)", borderTop: "1px solid var(--color-border)" }}>
          <h3 style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "var(--space-2)" }}>
            Add SMB User
          </h3>
          {addSmbUserMutation.error && (
            <div className={s.error} style={{ marginBottom: "var(--space-2)" }}>{addSmbUserMutation.error}</div>
          )}
          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                Username
              </label>
              <input
                className={s.input}
                placeholder="System username"
                value={newSmbUsername}
                onChange={(e) => setNewSmbUsername(e.target.value)}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                Password
              </label>
              <input
                className={s.input}
                type="password"
                placeholder="SMB password"
                value={newSmbPassword}
                onChange={(e) => setNewSmbPassword(e.target.value)}
              />
            </div>
            <button
              className={s.btnPrimary}
              onClick={handleAddSmbUser}
              disabled={addSmbUserMutation.loading || !newSmbUsername || !newSmbPassword}
            >
              {addSmbUserMutation.loading ? "Adding..." : "Add User"}
            </button>
          </div>
        </div>
      </div>

      {/* Card 4: Share Access */}
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
                      <input
                        className={s.input}
                        value={editingValidUsers}
                        onChange={(e) => setEditingValidUsers(e.target.value)}
                        placeholder="alice bob @staff"
                        style={{ width: "100%", minWidth: 200 }}
                      />
                    ) : (
                      <span className={s.mono} style={{ fontSize: "var(--text-sm)" }}>
                        {share.valid_users || <span style={{ color: "var(--color-text-dim)" }}>No restriction</span>}
                      </span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    {editingShare === share.share_name ? (
                      <div style={{ display: "flex", gap: "var(--space-2)" }}>
                        <button
                          className={s.btnPrimary}
                          onClick={() => handleUpdateAccess(share.share_name)}
                          disabled={updateAccessMutation.loading}
                          style={{ padding: "var(--space-1) var(--space-2)", fontSize: "var(--text-xs)" }}
                        >
                          {updateAccessMutation.loading ? "..." : "Save"}
                        </button>
                        <button
                          className={s.btnGhost}
                          onClick={() => { setEditingShare(null); setEditingValidUsers(""); }}
                          style={{ padding: "var(--space-1) var(--space-2)", fontSize: "var(--text-xs)" }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        className={s.btnGhost}
                        onClick={() => {
                          setEditingShare(share.share_name);
                          setEditingValidUsers(share.valid_users);
                        }}
                        style={{ display: "flex", alignItems: "center", gap: 4 }}
                      >
                        <KeyRound size={12} /> Edit Access
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div
          style={{
            marginTop: "var(--space-3)",
            background: "var(--color-bg-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            padding: "var(--space-2) var(--space-3)",
            fontSize: "var(--text-xs)",
            color: "var(--color-text-muted)",
          }}
        >
          Use space-separated usernames and @group names. Example: <code className={s.mono}>alice bob @staff</code>.
          Leave empty to remove restrictions (allow all authenticated users).
        </div>
      </div>
    </div>
  );
}
