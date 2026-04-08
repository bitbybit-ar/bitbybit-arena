"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { FormInput, FormTextarea, FormButton } from "@/components/ui/form";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
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

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [about, setAbout] = useState("");
  const [lightningAddress, setLightningAddress] = useState("");

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data) {
          const p = json.data;
          setProfile(p);
          setDisplayName(p.display_name || "");
          setUsername(p.username || "");
          setAbout(p.about || "");
          setLightningAddress(p.lightning_address || "");
        }
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
          about: about || null,
          lightning_address: lightningAddress || null,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setProfile(json.data);
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

  if (loading) {
    return (
      <div className={styles.loadingState}>
        <Spinner size="lg" />
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

        <FormButton type="submit" loading={saving} loadingText={t("saving")}>
          {tCommon("save")}
        </FormButton>
      </form>
    </div>
  );
}
