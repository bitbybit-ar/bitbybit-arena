"use client";

import { useTranslations } from "next-intl";
import { useSignerContext } from "@/lib/signer-context";
import { KeyIcon } from "@/components/icons";
import styles from "./signer-required-notice.module.scss";

/**
 * Inline banner shown above signing actions when the user can't sign.
 * Two cases:
 *  - **Anonymous** — no session cookie. Opens the signer modal in login
 *    mode so they can get a session + signer in one flow.
 *  - **Reattach** — session cookie is valid but no signer in memory
 *    (typical after reload for nsec / NIP-46 logins). Opens the modal
 *    in reattach mode.
 */
export function SignerRequiredNotice() {
  const t = useTranslations("signerRequired");
  const { needsSigner, needsReSignIn, requestReSignIn } = useSignerContext();

  if (!needsSigner) return null;

  const isAnonymous = !needsReSignIn;

  const handleClick = async () => {
    try {
      await requestReSignIn();
    } catch {
      /* user cancelled */
    }
  };

  return (
    <div className={styles.notice}>
      <div className={styles.iconBox}>
        <KeyIcon size={18} />
      </div>
      <div className={styles.content}>
        <strong className={styles.title}>
          {isAnonymous ? t("anonTitle") : t("title")}
        </strong>
        <p className={styles.body}>
          {isAnonymous ? t("anonBody") : t("body")}
        </p>
      </div>
      <button type="button" className={styles.cta} onClick={handleClick}>
        {isAnonymous ? t("anonCta") : t("cta")}
      </button>
    </div>
  );
}
