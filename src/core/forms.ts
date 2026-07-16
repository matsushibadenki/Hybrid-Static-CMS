import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { config } from "./config";
import { escapeHtml } from "./content";
import { sql, withTransaction } from "./db";
import { AppValidationError, isUniqueConstraintError, requireNonEmpty, validateSlug } from "./validation";
import type { FormFieldRecord, FormInput, FormRecord, FormFieldType } from "./types";

type RawFormRow = Record<string, unknown>;

function normalizeField(row: RawFormRow): FormFieldRecord {
  return {
    id: Number(row.id),
    formId: Number(row.form_id),
    name: String(row.name),
    label: String(row.label),
    type: row.field_type as FormFieldType,
    required: Boolean(row.required),
    options: Array.isArray(row.options_json) ? (row.options_json as string[]) : [],
    sortOrder: Number(row.sort_order ?? 0),
  };
}

function normalizeForm(row: RawFormRow, fields: FormFieldRecord[]): FormRecord {
  return {
    id: Number(row.id),
    title: String(row.title),
    slug: String(row.slug),
    description: (row.description as string | null) ?? null,
    status: row.status as "draft" | "published",
    submitLabel: String(row.submit_label ?? "Send"),
    successMessage: String(row.success_message ?? "Thank you."),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    authorId: row.author_id ? Number(row.author_id) : null,
    authorName: (row.author_name as string | null) ?? null,
    fields,
  };
}

function validateFields(fields: FormInput["fields"]) {
  if (fields.length === 0) {
    throw new AppValidationError("At least one field is required.");
  }
  for (const field of fields) {
    if (!field.name.trim() || !field.label.trim()) {
      throw new AppValidationError("Each field needs a name and label.");
    }
    if (field.type === "select" && (!field.options || field.options.length === 0)) {
      throw new AppValidationError(`Select field "${field.name}" needs at least one option.`);
    }
  }
}

function validateFormInput(input: FormInput) {
  requireNonEmpty(input.title, "Title");
  validateSlug(input.slug);
  validateFields(input.fields);
}

async function getFormFields(formId: number) {
  const rows = await sql`
    select id, form_id, name, label, field_type, required, options_json, sort_order
    from form_fields
    where form_id = ${formId}
    order by sort_order asc, id asc
  `;
  return rows.map((row) => normalizeField(row as RawFormRow));
}

async function syncFields(formId: number, fields: FormInput["fields"], trx: typeof sql) {
  await trx`delete from form_fields where form_id = ${formId}`;
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    await trx`
      insert into form_fields (
        form_id,
        name,
        label,
        field_type,
        required,
        options_json,
        sort_order
      ) values (
        ${formId},
        ${field.name.trim()},
        ${field.label.trim()},
        ${field.type},
        ${Boolean(field.required)},
        ${trx.json(field.options ?? [])},
        ${index}
      )
    `;
  }
}

export async function listForms(status: "draft" | "published" | "any" = "any", search?: string) {
  const filters: string[] = [];
  const params: string[] = [];

  if (status !== "any") {
    params.push(status);
    filters.push(`f.status = $${params.length}`);
  }

  if (search?.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`);
    filters.push(`(lower(f.title) like $${params.length} or lower(f.slug) like $${params.length})`);
  }

  const whereSql = filters.length > 0 ? `where ${filters.join(" and ")}` : "";
  const rows = await sql.unsafe(
    `
      select f.*, u.display_name as author_name
      from forms f
      left join users u on u.id = f.author_id
      ${whereSql}
      order by f.updated_at desc, f.id desc
    `,
    params as any[],
  );

  const items: FormRecord[] = [];
  for (const row of rows) {
    const fields = await getFormFields(Number(row.id));
    items.push(normalizeForm(row as RawFormRow, fields));
  }
  return items;
}

export async function getFormById(id: number) {
  const rows = await sql`
    select f.*, u.display_name as author_name
    from forms f
    left join users u on u.id = f.author_id
    where f.id = ${id}
    limit 1
  `;
  if (!rows[0]) {
    return null;
  }
  const fields = await getFormFields(id);
  return normalizeForm(rows[0] as RawFormRow, fields);
}

export async function getFormBySlug(slug: string, status: "draft" | "published" | "any" = "published") {
  const rows =
    status === "any"
      ? await sql`
          select f.*, u.display_name as author_name
          from forms f
          left join users u on u.id = f.author_id
          where f.slug = ${slug}
          limit 1
        `
      : await sql`
          select f.*, u.display_name as author_name
          from forms f
          left join users u on u.id = f.author_id
          where f.slug = ${slug}
            and f.status = ${status}
          limit 1
        `;
  if (!rows[0]) {
    return null;
  }
  const fields = await getFormFields(Number(rows[0].id));
  return normalizeForm(rows[0] as RawFormRow, fields);
}

export async function createForm(input: FormInput, authorId: number) {
  validateFormInput(input);
  let formId: number;
  try {
    formId = await withTransaction(async (trx) => {
      const rows = await trx`
        insert into forms (
          title,
          slug,
          description,
          status,
          submit_label,
          success_message,
          author_id
        ) values (
          ${input.title},
          ${input.slug},
          ${input.description ?? null},
          ${input.status},
          ${input.submitLabel ?? "Send"},
          ${input.successMessage ?? "Thank you. Your submission has been received."},
          ${authorId}
        )
        returning id
      `;
      const id = Number(rows[0].id);
      await syncFields(id, input.fields, trx as unknown as typeof sql);
      return id;
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppValidationError(`Slug "${input.slug}" is already in use.`);
    }
    throw error;
  }
  return getFormById(formId);
}

export async function updateForm(id: number, input: FormInput) {
  validateFormInput(input);
  try {
    await withTransaction(async (trx) => {
      await trx`
        update forms
        set
          title = ${input.title},
          slug = ${input.slug},
          description = ${input.description ?? null},
          status = ${input.status},
          submit_label = ${input.submitLabel ?? "Send"},
          success_message = ${input.successMessage ?? "Thank you. Your submission has been received."},
          updated_at = now()
        where id = ${id}
      `;
      await syncFields(id, input.fields, trx as unknown as typeof sql);
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppValidationError(`Slug "${input.slug}" is already in use.`);
    }
    throw error;
  }
  return getFormById(id);
}

export async function deleteForm(id: number) {
  await sql`delete from forms where id = ${id}`;
}

export async function createFormSubmission(formId: number, payload: Record<string, string>) {
  await sql`
    insert into form_submissions (form_id, payload_json)
    values (${formId}, ${sql.json(payload)})
  `;
}

export async function listFormSubmissions(formId: number) {
  const rows = await sql`
    select id, payload_json, created_at
    from form_submissions
    where form_id = ${formId}
    order by created_at desc, id desc
  `;
  return rows.map((row) => ({
    id: Number(row.id),
    payload: row.payload_json as Record<string, string>,
    createdAt: String(row.created_at),
  }));
}

function csvValue(value: unknown) {
  const text = value == null ? "" : typeof value === "string" ? value : JSON.stringify(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function renderFormSubmissionsCsv(form: FormRecord, submissions: Awaited<ReturnType<typeof listFormSubmissions>>) {
  const fieldNames = form.fields.map((field) => field.name);
  const rows = [
    ["created_at", ...fieldNames],
    ...submissions.map((submission) => [
      submission.createdAt,
      ...fieldNames.map((fieldName) => submission.payload[fieldName] ?? ""),
    ]),
  ];
  return `${rows.map((row) => row.map(csvValue).join(",")).join("\r\n")}\r\n`;
}

export async function deleteExpiredFormSubmissions() {
  if (config.formSubmissionRetentionDays <= 0) {
    return 0;
  }
  const result = await sql`
    delete from form_submissions
    where created_at < now() - make_interval(days => ${config.formSubmissionRetentionDays})
  `;
  return result.count;
}

function renderField(field: FormFieldRecord) {
  const required = field.required ? "required" : "";
  if (field.type === "textarea") {
    return `<label>${escapeHtml(field.label)}<textarea name="${escapeHtml(field.name)}" ${required}></textarea></label>`;
  }
  if (field.type === "select") {
    const options = field.options
      .map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`)
      .join("");
    return `<label>${escapeHtml(field.label)}<select name="${escapeHtml(field.name)}" ${required}>${options}</select></label>`;
  }
  if (field.type === "checkbox") {
    return `<label class="checkbox-label"><input type="checkbox" name="${escapeHtml(field.name)}" value="yes" /> <span>${escapeHtml(field.label)}</span></label>`;
  }
  return `<label>${escapeHtml(field.label)}<input type="${escapeHtml(field.type)}" name="${escapeHtml(field.name)}" ${required} /></label>`;
}

export function renderFormHtml(form: FormRecord) {
  const fields = form.fields.map(renderField).join("");
  const recaptchaEnabled = Boolean(config.recaptchaSiteKey && config.recaptchaSecretKey);
  const recaptchaAction = `form_submit_${form.slug.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const recaptchaMarkup = recaptchaEnabled
    ? `
    <input type="hidden" name="recaptchaToken" value="" />
    <script src="https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(config.recaptchaSiteKey ?? "")}"></script>
    <script>
      (() => {
        const form = document.currentScript?.closest(".hybrid-static-cms-form-fragment")?.querySelector("form");
        if (!form || !window.grecaptcha) return;
        const tokenField = form.querySelector('input[name="recaptchaToken"]');
        const action = ${JSON.stringify(recaptchaAction)};
        const siteKey = ${JSON.stringify(config.recaptchaSiteKey ?? "")};
        const submitButton = form.querySelector('button[type="submit"]');
        let isSubmitting = false;

        const run = () => new Promise((resolve, reject) => {
          window.grecaptcha.ready(() => {
            window.grecaptcha.execute(siteKey, { action })
              .then((token) => {
                if (tokenField) tokenField.value = token;
                resolve(token);
              })
              .catch(reject);
          });
        });

        form.addEventListener("submit", async (event) => {
          if (isSubmitting) return;
          event.preventDefault();
          isSubmitting = true;
          if (submitButton) submitButton.disabled = true;
          try {
            await run();
            form.submit();
          } catch {
            isSubmitting = false;
            if (submitButton) submitButton.disabled = false;
            const target = form.querySelector(".hybrid-static-cms-form__status");
            if (target) {
              target.textContent = "Spam protection could not be verified. Please try again.";
            }
          }
        });
      })();
    </script>`
    : "";
  return `
<section class="hybrid-static-cms-form-fragment">
  <form method="post" action="${config.cmsApiPrefix}/forms/${escapeHtml(form.slug)}/submit" class="hybrid-static-cms-form">
    ${form.description ? `<p>${escapeHtml(form.description)}</p>` : ""}
    ${fields}
    ${recaptchaMarkup}
    <button type="submit">${escapeHtml(form.submitLabel)}</button>
    <p class="hybrid-static-cms-form__status" aria-live="polite"></p>
  </form>
</section>`;
}

export async function renderFormArtifacts() {
  const forms = await listForms("published");
  const formsDir = path.join(config.cmsOutputDir, "forms");
  await mkdir(formsDir, { recursive: true });
  for (const form of forms) {
    await writeFile(path.join(formsDir, `${form.slug}.html`), renderFormHtml(form), "utf8");
  }
}
