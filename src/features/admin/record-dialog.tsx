"use client";

import { useMemo, useState, useTransition } from "react";
import { useForm, type FieldValues, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ZodType } from "zod";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { UploadedFile } from "@/features/storage/upload-client";
import { schemaFor, type EditableResource } from "@/lib/validators/admin";
import { validationText } from "@/lib/validators/messages";
import { saveResourceAction } from "./actions";
import { RecordFields, type ResolvedField } from "./record-form";

type Values = Record<string, unknown>;

/** Create / edit dialog. Client validation mirrors the server schema; server errors are mapped back onto fields. */
export function RecordDialog({
  resource, id, fields, initial, initialFile, title, onClose, onSaved,
}: {
  resource: EditableResource;
  id: string | null;
  fields: ResolvedField[];
  initial?: Values;
  initialFile?: UploadedFile;
  title: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const c = useTranslations("common");
  const v = useTranslations("admin.validation");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const schema = useMemo(() => schemaFor(resource, id === null), [resource, id]);
  const defaults = useMemo(
    () => Object.fromEntries(fields.map((f) => [f.name, initial?.[f.name] ?? f.default ?? (f.kind === "multiselect" || f.kind === "questionPicker" ? [] : f.kind === "checkbox" ? false : "")])),
    [fields, initial],
  );
  const form = useForm<FieldValues>({ resolver: zodResolver(schema as unknown as ZodType<FieldValues>) as unknown as Resolver<FieldValues>, defaultValues: defaults });

  const errorText = (code?: string) => (code ? validationText(v as unknown as (k: string, p?: Record<string, string | number>) => string, code) : undefined);

  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      setFormError(null);
      const res = await saveResourceAction(resource, id, values);
      if (res.ok) {
        onSaved();
        router.refresh();
        return;
      }
      if (res.fieldErrors) {
        let placed = false;
        for (const [name, code] of Object.entries(res.fieldErrors)) {
          if (fields.some((f) => f.name === name)) {
            form.setError(name, { message: code });
            placed = true;
          }
        }
        if (placed && res.code === "INVALID") return;
      }
      setFormError(res.code === "FORBIDDEN" ? "forbidden" : (res.message ?? "generic"));
    }),
  );

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">{title}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {formError ? <Alert variant="destructive">{errorText(formError)}</Alert> : null}
          <RecordFields form={form} fields={fields} errorText={errorText} initialFile={initialFile} placeholder="—" />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>{c("cancel")}</Button>
            <Button type="submit" loading={pending}>{c("save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
