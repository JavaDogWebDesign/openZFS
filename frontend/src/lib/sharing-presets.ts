export interface PresetState {
  shadow: boolean;
  macOs: boolean;
  audit: boolean;
}

export function computePresets(
  presets: PresetState,
  manualVfs: string,
  manualExtraParams: Record<string, string>,
): { vfsObjects: string; extraParams: Record<string, string> } {
  const vfsParts: string[] = [];
  const extraParams: Record<string, string> = {};

  if (presets.shadow) {
    vfsParts.push("shadow_copy2");
    extraParams["shadow:snapdir"] = ".zfs/snapshot";
    extraParams["shadow:sort"] = "desc";
  }
  if (presets.macOs) {
    vfsParts.push("catia", "fruit", "streams_xattr");
    extraParams["fruit:metadata"] = "stream";
    extraParams["fruit:posix_rename"] = "yes";
    extraParams["fruit:encoding"] = "native";
  }
  if (presets.audit) {
    vfsParts.push("full_audit");
    extraParams["full_audit:prefix"] = "%u|%I|%m|%S";
    extraParams["full_audit:success"] = "connect disconnect mkdir rmdir open rename unlink";
    extraParams["full_audit:failure"] = "connect";
  }

  // Merge manual VFS objects (avoid duplicates)
  const trimmedVfs = manualVfs.trim();
  if (trimmedVfs) {
    for (const v of trimmedVfs.split(/\s+/)) {
      if (!vfsParts.includes(v)) vfsParts.push(v);
    }
  }

  // Merge manual extra_params
  for (const [k, v] of Object.entries(manualExtraParams)) {
    if (!(k in extraParams)) extraParams[k] = v;
  }

  return { vfsObjects: vfsParts.join(" "), extraParams };
}
