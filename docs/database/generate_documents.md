Require Timesamps from utilities timestamps

# Create the markdown content

md_content = f"""# 🗃️ `generate_documents` Table Documentation

This file documents the **`generate_documents`** table used within the **Welt Funeral Home Digital System** for managing and generating official documents such as release forms, certificates, and permits.

---

## 🧾 Overview

The `generate_documents` table stores template information and configuration data used for dynamically generating printable or digital documents. Each record defines the base template, fillable areas, barcode/QR code, and digital signature placement for verification and auditing.

---

## 📋 Column Definitions

| Column                  | Type                                  | Description                                                                  |
| :---------------------- | :------------------------------------ | :--------------------------------------------------------------------------- |
| `id`                    | `BIGINT`                              | Auto-incremented unique identifier for each record.                          |
| `document_name`         | `VARCHAR(255)`                        | The display name of the document (e.g. “Body Release Form”).                 |
| `document_type`         | `VARCHAR(100)`                        | The type or category of the document (e.g. “Form”, “Certificate”, “Permit”). |
| `document_code`         | `VARCHAR(100)`                        | Unique template or document identifier.                                      |
| `file_path`             | `VARCHAR(500)`                        | Storage path for generated document files (e.g. PDF).                        |
| `template_image`        | `LONGBLOB`                            | Binary data for the base document image (PNG/JPEG).                          |
| `template_image_format` | `ENUM('png','jpeg')`                  | File format for the stored image template.                                   |
| `fillable_fields`       | `JSON`                                | Defines text/field coordinates and database mapping.                         |
| `barcode_value`         | `VARCHAR(100)`                        | Value used for QR/barcode verification during export.                        |
| `signature_area`        | `JSON`                                | Defines where to place the e-signature (coordinates, size).                  |
| `created_by`            | `VARCHAR(100)`                        | Username or staff ID who uploaded or created the template.                   |
| `created_at`            | `DATETIME`                            | Manually set date/time when the record was created.                          |
| `updated_at`            | `DATETIME`                            | Manually updated date/time when the record was modified.                     |
| `status`                | `ENUM('active','archived','deleted')` | Current status of the document template.                                     |
| `notes`                 | `TEXT`                                | Optional remarks or additional context.                                      |

---

## ⚙️ Document Generation Workflow

1. Retrieve the template record using `document_code`.
2. Load `template_image` or file path from `file_path`.
3. Parse the `fillable_fields` and inject relevant dynamic data.
4. Apply digital signature using coordinates from `signature_area`.
5. Generate output as PDF, update `file_path` in the database.
6. Optionally, render `barcode_value` for tracking and validation.

---

## 🧱 SQL Table Schema

```sql
CREATE TABLE generate_documents (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    document_name VARCHAR(255) NOT NULL,              -- e.g. "Release Form"
    document_type VARCHAR(100) NOT NULL,              -- e.g. "Form", "Certificate", etc.
    document_code VARCHAR(100) UNIQUE NOT NULL,       -- unique code or template identifier
    file_path VARCHAR(500),                           -- optional: path to generated output PDF
    template_image LONGBLOB,                          -- base image of the document (PNG/JPEG)
    template_image_format ENUM('png', 'jpeg') DEFAULT 'png',
    fillable_fields JSON,                             -- defines text/field positions and keys
    barcode_value VARCHAR(100),                       -- barcode/QR value for verification
    signature_area JSON,                              -- defines signature position and size
    created_by VARCHAR(100) NOT NULL,                 -- who added the document template
    created_at DATETIME NOT NULL,                     -- manually inserted date/time
    updated_at DATETIME NOT NULL,                     -- manually updated by your system
    status ENUM('active', 'archived', 'deleted') DEFAULT 'active',
    notes TEXT                                        -- optional extra info or description
);
```
