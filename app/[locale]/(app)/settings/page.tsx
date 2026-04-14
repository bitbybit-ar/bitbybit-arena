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
import { useRouter, usePathname } from "@/i18n/routing";
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

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [about, setAbout] = useState("");
  const [lightningAddress, setLightningAddress] = useState("");

  const applyProfile = (p: UserProfile) => {
    setProfile(p);
    setDisplayName(p.display_name || "");
    setUsername(p.username || "");
    setAvatarUrl(p.avatar_url || "");
    setAbout(p.about || "");
    setLightningAddress(p.lightning_address || "");
  };

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
    setSaving(true);

    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName,
          username,
          avatar_url: avatarUrl.trim() || null,
          about: about || null,
          lightning_address: lightningAddress || null,
        }),
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
    setThemePreference(value as ThemePreference);
  };

  const handleLanguageChange = async (value: string) => {
    if (value === currentLocale) return;
    // Persist on the server so future sessions remember the choice.
    try {
      await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: value }),
      });
    } catch {
      // Navigation still succeeds even if persistence fails.
    }
    router.replace(pathname, { locale: value as "es" | "en" });
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

      <form onSubmit={handleSave} className={styles.card}>
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
          <FormButton type="submit" loading={saving} loadingText={t("saving")}>
            {tCommon("save")}
          </FormButton>
          <FormButton
            type="button"
            variant="outline"
            onClick={handleSync}
            loading={syncing}
            loadingText={t("syncing")}
          >
            {t("syncFromRelays")}
          </FormButton>
          <FormButton
            type="button"
            variant="outline"
            onClick={handlePublish}
            loading={publishing}
            loadingText={t("publishing")}
          >
            {t("publishToNostr")}
          </FormButton>
        </div>
      </form>

      <section className={styles.card}>
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
          value={currentLocale}
          onChange={handleLanguageChange}
          options={[
            { value: "es", label: t("languageEs") },
            { value: "en", label: t("languageEn") },
          ]}
        />
      </section>

      <section className={`${styles.card} ${styles.dangerCard}`}>
        <h2 className={styles.sectionTitle}>{t("dangerZone")}</h2>
        <p className={styles.hint}>{t("deleteAccountHint")}</p>
        <Button
          variant="outline"
          className={styles.dangerButton}
          onClick={() => setShowDeleteModal(true)}
        >
          {t("deleteAccount")}
        </Button>
      </section>

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
              variant="primary"
              className={styles.dangerButton}
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
