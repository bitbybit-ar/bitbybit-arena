"use client";

import { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { FormInput, FormTextarea, FormButton, FormSelect } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { BlockLoader } from "@/components/ui/block-loader";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useTheme, type ThemePreference } from "@/lib/contexts/theme-context";
import { useSignerContext } from "@/lib/signer-context";
import { fetchNostrMetadata } from "@/lib/nostr/metadata";
import { buildProfileMetadataEvent } from "@/lib/nostr/events";
import { publishSignedEvent } from "@/lib/nostr/publish";
import type { NostrMetadata } from "@/lib/nostr/types";
import { UpdateProfileBodySchema } from "@/lib/schemas/profile";
import { validateForm } from "@/lib/schemas/validate-form";
import { useRouter, usePathname } from "@/i18n/routing";
import { NOTIFICATION_TYPES, type NotificationType, type NotificationPrefs } from "@/lib/types";
import styles from "./settings.module.scss";

interface UserProfile {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  about: string | null;
  lightning_address: string | null;
  nostr_pubkey: string;
  locale: string;
  notification_prefs: NotificationPrefs;
}

export default function SettingsPage() {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const { showToast } = useToast();
  const { preference: themePref, setThemePreference } = useTheme();
  const { signWithPrompt, needsSigner, requestReSignIn } = useSignerContext();
  const router = useRouter();
  const pathname = usePathname();
  const currentLocale = useLocale();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  // Per-section save sentinels. Separate from the profile `saving` flag
  // so a user toggling Notifications doesn't disable the Profile form's
  // submit button (and vice versa).
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [savingNotifications, setSavingNotifications] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [about, setAbout] = useState("");
  const [lightningAddress, setLightningAddress] = useState("");
  // Notifications: working copy + last-saved snapshot. The dirty
  // computation below diffs them so the Save button is only active
  // when there's something to persist.
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>({});
  const [savedNotifPrefs, setSavedNotifPrefs] = useState<NotificationPrefs>({});
  // Preferences: language is the only server-persisted preference here
  // (theme lives in localStorage via ThemeProvider). We track a
  // pending value so the dropdown change doesn't immediately switch
  // the URL — the locale flip happens on Save.
  const [pendingLocale, setPendingLocale] = useState<string>(currentLocale);

  const applyProfile = (p: UserProfile) => {
    setProfile(p);
    setDisplayName(p.display_name || "");
    setUsername(p.username || "");
    setAvatarUrl(p.avatar_url || "");
    setAbout(p.about || "");
    setLightningAddress(p.lightning_address || "");
    const prefs = p.notification_prefs ?? {};
    setNotifPrefs(prefs);
    setSavedNotifPrefs(prefs);
  };

  const handleToggleNotifPref = (type: NotificationType) => {
    // Local-only flip — the persistence happens on Save click. Default
    // (missing key) is enabled, so we flip to the opposite of that.
    const currentlyEnabled = notifPrefs[type] !== false;
    setNotifPrefs((prev) => ({ ...prev, [type]: !currentlyEnabled }));
  };

  // Diff vs the last server snapshot — compares each notification
  // type's *effective* enabled state (default-true when the key is
  // missing) so adding/removing a key from the map doesn't read as a
  // change when the user-visible toggle hasn't moved. Avoids the JSON
  // serialisation hack which would also trip on key-order differences
  // between API responses.
  const notifPrefsDirty = NOTIFICATION_TYPES.some(
    (type) => (notifPrefs[type] !== false) !== (savedNotifPrefs[type] !== false)
  );
  const preferencesDirty = pendingLocale !== currentLocale;
  // Profile dirty check — compares each form field to the last value
  // we got back from the server (normalised the same way applyProfile
  // applies them, so a `null` server value matches an empty string in
  // the input). Drives the Save and Publish-to-Nostr disabled states
  // so neither button fires a no-op write.
  const profileDirty =
    !!profile &&
    (displayName !== (profile.display_name || "") ||
      username !== (profile.username || "") ||
      avatarUrl !== (profile.avatar_url || "") ||
      about !== (profile.about || "") ||
      lightningAddress !== (profile.lightning_address || ""));

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data) applyProfile(json.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    // Pre-flight against the same schema the API uses
    // (lib/schemas/profile.ts) so the user gets instant feedback for
    // bad inputs (empty display_name, short username, non-http(s)
    // avatar URL) without a round-trip.
    const validation = validateForm(UpdateProfileBodySchema, {
      display_name: displayName,
      username,
      avatar_url: avatarUrl.trim() || null,
      about: about || null,
      lightning_address: lightningAddress || null,
    });
    if (!validation.success) {
      showToast(validation.firstError, "error");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validation.data),
      });

      const json = await res.json();
      if (json.success) {
        applyProfile(json.data);
        showToast(t("saved"), "success");
      } else {
        showToast(json.error || tCommon("error"), "error");
      }
    } catch {
      showToast(tCommon("error"), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/profile/sync", { method: "POST" });
      const json = await res.json();
      if (json.success && json.data) {
        applyProfile(json.data);
        showToast(t("syncSuccess"), "success");
      } else {
        showToast(json.error || t("syncFailed"), "error");
      }
    } catch {
      showToast(t("syncFailed"), "error");
    } finally {
      setSyncing(false);
    }
  };

  const handlePublish = async () => {
    if (!profile) return;
    if (needsSigner) {
      try {
        await requestReSignIn();
      } catch {
        return;
      }
    }
    setPublishing(true);
    try {
      // Fetch the latest kind:0 from relays so we don't clobber fields
      // we don't manage (nip05, website, banner, etc.). If nothing is on
      // relays yet, start from our cached metadata or an empty object.
      const remote = await fetchNostrMetadata(profile.nostr_pubkey).catch(
        () => null
      );
      const base: NostrMetadata = remote ?? {};

      const merged: NostrMetadata = {
        ...base,
        name: username.trim(),
        display_name: displayName.trim(),
        picture: avatarUrl.trim() || undefined,
        about: about.trim() || undefined,
        lud16: lightningAddress.trim() || undefined,
      };

      const signed = await signWithPrompt(buildProfileMetadataEvent(merged));
      await publishSignedEvent(signed);
      showToast(t("publishSuccess"), "success");
    } catch {
      showToast(t("publishFailed"), "error");
    } finally {
      setPublishing(false);
    }
  };

  const handleThemeChange = (value: string) => {
    // Theme is local-only (ThemeProvider persists to localStorage), so
    // we apply it instantly for visual feedback rather than gating it
    // behind the Preferences Save button.
    setThemePreference(value as ThemePreference);
  };

  const handleSavePreferences = async () => {
    if (!preferencesDirty) return;
    setSavingPreferences(true);
    try {
      // Persist locale on the server so future sessions remember it.
      // Failure here is non-blocking — the local navigation below still
      // succeeds, the user just won't have it remembered cross-device.
      try {
        await fetch("/api/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locale: pendingLocale }),
        });
      } catch { /* non-blocking */ }
      router.replace(pathname, { locale: pendingLocale as "es" | "en" });
      showToast(t("preferencesSaved"), "success");
    } finally {
      setSavingPreferences(false);
    }
  };

  const handleSaveNotifications = async () => {
    if (!notifPrefsDirty) return;
    setSavingNotifications(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notification_prefs: notifPrefs }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      if (json.data) applyProfile(json.data);
      showToast(t("notificationsSaved"), "success");
    } catch {
      showToast(t("notifications.saveFailed"), "error");
    } finally {
      setSavingNotifications(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch("/api/profile", { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        // Session cookie is cleared server-side. Redirect to landing.
        window.location.href = `/${currentLocale}`;
      } else {
        showToast(json.error || tCommon("error"), "error");
        setDeleting(false);
      }
    } catch {
      showToast(tCommon("error"), "error");
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.loadingState}>
        <BlockLoader label={tCommon("loading")} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{t("title")}</h1>

      <div className={styles.grid}>
        <form
          onSubmit={handleSave}
          className={`${styles.card} ${styles.areaProfile}`}
        >
        <h2 className={styles.sectionTitle}>{t("profile")}</h2>

        {profile && (
          <p className={styles.pubkey}>
            {t("nostrPubkey")}: <code>{profile.nostr_pubkey.slice(0, 12)}...{profile.nostr_pubkey.slice(-8)}</code>
          </p>
        )}

        <FormInput
          label={t("displayName")}
          value={displayName}
          onChange={setDisplayName}
          required
        />

        <FormInput
          label={t("username")}
          value={username}
          onChange={setUsername}
          required
        />

        <FormInput
          label={t("avatarUrl")}
          value={avatarUrl}
          onChange={setAvatarUrl}
          placeholder={t("avatarPlaceholder")}
          type="url"
        />

        <FormTextarea
          label={t("about")}
          value={about}
          onChange={setAbout}
          rows={3}
          placeholder={t("aboutPlaceholder")}
        />

        <FormInput
          label={t("lightningAddress")}
          value={lightningAddress}
          onChange={setLightningAddress}
          placeholder={t("lightningPlaceholder")}
        />

        <p className={styles.hint}>{t("syncHint")}</p>

        <div className={styles.actionsRow}>
          <FormButton
            type="submit"
            disabled={!profileDirty}
            loading={saving}
            loadingText={t("saving")}
          >
            {tCommon("save")}
          </FormButton>
          <FormButton
            type="button"
            variant="ghost"
            onClick={handleSync}
            loading={syncing}
            loadingText={t("syncing")}
          >
            {t("syncFromRelays")}
          </FormButton>
          <FormButton
            type="button"
            variant="ghost"
            onClick={handlePublish}
            // Publishing pushes the current form state to Nostr; if the
            // form matches the server snapshot there's nothing the user
            // hasn't already published (or could publish) so we treat
            // it as a no-op and disable the button.
            disabled={!profileDirty}
            loading={publishing}
            loadingText={t("publishing")}
          >
            {t("publishToNostr")}
          </FormButton>
        </div>
      </form>

        <section
          className={`${styles.card} ${styles.areaPreferences}`}
        >
          <h2 className={styles.sectionTitle}>{t("preferences")}</h2>

          <FormSelect
            label={t("theme")}
            value={themePref}
            onChange={handleThemeChange}
            options={[
              { value: "system", label: t("themeSystem") },
              { value: "light", label: t("themeLight") },
              { value: "dark", label: t("themeDark") },
            ]}
          />

          <FormSelect
            label={t("language")}
            value={pendingLocale}
            onChange={setPendingLocale}
            options={[
              { value: "es", label: t("languageEs") },
              { value: "en", label: t("languageEn") },
            ]}
          />

          <div className={styles.sectionFooter}>
            <Button
              size="sm"
              onClick={handleSavePreferences}
              disabled={!preferencesDirty || savingPreferences}
              aria-busy={savingPreferences || undefined}
            >
              {savingPreferences ? t("saving") : tCommon("save")}
            </Button>
          </div>
        </section>

        <section
          className={`${styles.card} ${styles.areaNotifications}`}
        >
          <h2 className={styles.sectionTitle}>
            {t("notifications.sectionTitle")}
          </h2>
          <p className={styles.hint}>{t("notifications.sectionHint")}</p>
          <ul className={styles.notifPrefsList}>
            {NOTIFICATION_TYPES.map((type) => {
              const enabled = notifPrefs[type] !== false;
              const inputId = `notif-pref-${type}`;
              return (
                <li key={type} className={styles.notifPrefRow}>
                  <label htmlFor={inputId} className={styles.notifPrefLabel}>
                    {t(`notifications.labels.${type}`)}
                  </label>
                  <input
                    id={inputId}
                    type="checkbox"
                    role="switch"
                    checked={enabled}
                    onChange={() => handleToggleNotifPref(type)}
                    className={styles.notifPrefToggle}
                  />
                </li>
              );
            })}
          </ul>

          <div className={styles.sectionFooter}>
            <Button
              size="sm"
              onClick={handleSaveNotifications}
              disabled={!notifPrefsDirty || savingNotifications}
              aria-busy={savingNotifications || undefined}
            >
              {savingNotifications ? t("saving") : tCommon("save")}
            </Button>
          </div>
        </section>

        <section
          className={`${styles.card} ${styles.dangerCard} ${styles.areaPrivacy}`}
        >
          <div className={styles.dangerRow}>
            <div className={styles.dangerText}>
              <h2 className={styles.sectionTitle}>{t("dangerZone")}</h2>
              <p className={styles.hint}>{t("deleteAccountHint")}</p>
            </div>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setShowDeleteModal(true)}
            >
              {t("deleteAccount")}
            </Button>
          </div>
        </section>
      </div>

      {showDeleteModal && (
        <Modal
          title={t("deleteAccountConfirmTitle")}
          onClose={() => {
            if (!deleting) setShowDeleteModal(false);
          }}
          size="sm"
        >
          <p className={styles.modalBody}>{t("deleteAccountConfirmBody")}</p>
          <div className={styles.modalActions}>
            <Button
              variant="outline"
              onClick={() => setShowDeleteModal(false)}
              disabled={deleting}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              disabled={deleting}
              aria-busy={deleting || undefined}
            >
              {deleting ? t("deleting") : t("confirmDelete")}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
