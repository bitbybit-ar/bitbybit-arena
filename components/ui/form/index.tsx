"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dropdown, type DropdownOption } from "@/components/ui/dropdown";
import { EyeIcon, EyeOffIcon } from "@/components/icons";
import styles from "./form.module.scss";

// ── FormField ──────────────────────────────────────────────

interface FormFieldProps {
  label?: string;
  required?: boolean;
  error?: string;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}

export function FormField({ label, required, error, htmlFor, className, children }: FormFieldProps) {
  return (
    <div className={cn(styles.field, error && styles.fieldError, className)}>
      {label && (
        <label htmlFor={htmlFor} className={styles.label}>
          {label}
          {required && <span className={styles.required}>*</span>}
        </label>
      )}
      {children}
      {error && (
        <span id={htmlFor ? `${htmlFor}-error` : undefined} className={styles.errorText} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

// ── FormInput ──────────────────────────────────────────────

interface FormInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  label?: string;
  required?: boolean;
  error?: string;
  fieldClassName?: string;
  onChange?: (value: string) => void;
}

export function FormInput({
  label,
  required,
  error,
  fieldClassName,
  id,
  onChange,
  className,
  type,
  ...inputProps
}: FormInputProps) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";

  const inputClass = cn(
    styles.input,
    error && styles.inputError,
    isPassword && styles.inputWithToggle,
    className
  );

  return (
    <FormField label={label} required={required} error={error} htmlFor={id} className={fieldClassName}>
      <div className={styles.inputWrapper}>
        <input
          id={id}
          type={isPassword && showPassword ? "text" : type}
          className={inputClass}
          aria-invalid={!!error}
          aria-describedby={error && id ? `${id}-error` : undefined}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          {...inputProps}
        />
        {isPassword && (
          <button
            type="button"
            className={styles.passwordToggle}
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
          >
            {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
          </button>
        )}
      </div>
    </FormField>
  );
}

// ── FormSelect ─────────────────────────────────────────────

interface FormSelectProps {
  label?: string;
  required?: boolean;
  error?: string;
  fieldClassName?: string;
  className?: string;
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  placeholder?: string;
  disabled?: boolean;
  "aria-label"?: string;
}

export function FormSelect({
  label,
  required,
  error,
  fieldClassName,
  id,
  onChange,
  className,
  value,
  options,
  placeholder,
  disabled,
  ...rest
}: FormSelectProps) {
  return (
    <FormField label={label} required={required} error={error} htmlFor={id} className={fieldClassName}>
      <Dropdown
        id={id}
        options={options}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        aria-label={rest["aria-label"] ?? label}
      />
    </FormField>
  );
}

// ── FormTextarea ───────────────────────────────────────────

interface FormTextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange"> {
  label?: string;
  required?: boolean;
  error?: string;
  fieldClassName?: string;
  onChange?: (value: string) => void;
}

export function FormTextarea({
  label,
  required,
  error,
  fieldClassName,
  id,
  onChange,
  className,
  ...textareaProps
}: FormTextareaProps) {
  return (
    <FormField label={label} required={required} error={error} htmlFor={id} className={fieldClassName}>
      <textarea
        id={id}
        className={cn(styles.textarea, error && styles.inputError, className)}
        aria-invalid={!!error}
        aria-describedby={error && id ? `${id}-error` : undefined}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        {...textareaProps}
      />
    </FormField>
  );
}

// ── FormButton ─────────────────────────────────────────────
// Thin wrapper around the shared Button: full-width layout plus loading
// state. Variant and sizing come from Button itself.

interface FormButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingText?: string;
  variant?: "primary" | "outline";
}

export function FormButton({
  loading,
  loadingText,
  variant = "primary",
  children,
  disabled,
  className,
  ...buttonProps
}: FormButtonProps) {
  return (
    <Button
      variant={variant}
      fullWidth
      className={cn(styles.formButton, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...buttonProps}
    >
      {loading ? (loadingText ?? children) : children}
    </Button>
  );
}
