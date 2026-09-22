# Signing the Windows build

This guide covers how to sign Somnus Windows releases so that users see a verified publisher
instead of "Unknown publisher". Prices and eligibility were checked in September 2026.

## TL;DR

| | Recommended now | Fallback / later |
|---|---|---|
| What | **Certum "Standard Code Signing in the Cloud", issued to you as a private individual** | **Azure Artifact Signing** (formerly Trusted Signing), Basic tier |
| Cost | About €139–209 per year before VAT (cheaper on a multi-year plan) | $9.99 per month (about $120 per year) |
| Can you get it today? | Yes. Certum issues standard certificates to natural persons, and closed-source commercial software is allowed. | **No, not as an individual in the EU.** Individuals must be in the USA or Canada. EU **organizations** are eligible, so it becomes an option if you register a company. |
| Build switch | `SOMNUS_WIN_SIGN_SHA1=<thumbprint>` | `SOMNUS_AZURE_SIGN_*` plus `AZURE_TENANT_ID`, `AZURE_CLIENT_ID` and `AZURE_CLIENT_SECRET` |

**What signing does not do:** it will not make the "Windows protected your PC" (SmartScreen) prompt
go away on day one. No certificate does that any more, including EV. Since 2024, EV certificates go
through the same reputation process as OV certificates. Signing does three things:

- It replaces "Unknown publisher" with your verified name.
- It lets reputation build up on your publisher identity across releases, instead of starting from
  zero for every new file hash.
- It stops Windows 11 **Smart App Control** from blocking the installer, because Smart App Control
  blocks unsigned files that have no reputation.

Expect warnings for the first few weeks, until a few hundred users have installed the app.

## How the build decides whether to sign

`npm run builder` (and therefore `dist:win`, `dist:win:nsis` and `pack`) runs
`scripts/run-electron-builder.mjs`. That script asks `scripts/windows-signing.mjs` what to do.

- **No signing variables set (the normal case):** nothing changes. `package.json` keeps
  `win.signAndEditExecutable: false`, rcedit stamps the icon and identity, and the output is
  unsigned. Every end-user install and update rebuild takes this path.
- **Signing variables set, on a Windows host:** the script writes a temporary config file. It
  contains the `package.json` `"build"` block plus these overrides:
  - `win.signAndEditExecutable: true`
  - `win.forceCodeSigning: true`, so a broken credential **fails** the build instead of producing
    an unsigned installer
  - `copyright`, set to the same `LegalCopyright` that rcedit stamps
  - the signing provider's settings

  The script passes this file with `--config`.
- `SOMNUS_WIN_SIGN=off` forces an unsigned build even when credentials are present.
- `npm run signing:check` prints the decision and the effective `win` config without building.

The order of operations is safe. electron-builder 26.15 applies every change to the exe before it
signs, and nothing changes the exe afterwards:

1. The `afterExtract` hook (rcedit) stamps the pristine `electron.exe`.
2. electron-builder adds the ASAR-integrity resource.
3. electron-builder rewrites the version resources.
4. **electron-builder signs `Somnus.exe`.**
5. The NSIS target builds the uninstaller and `Setup.exe`, and signs both.

---

## Recommended: Certum Standard Code Signing in the Cloud (individual)

### 1. Buy the certificate (about 15 minutes)

- Buy **"Standard Code Signing in the Cloud"** from one of these:
  - Certum's shop: https://shop.certum.eu/code-signing.html (from €209)
  - a reseller's individual-developer SKU, for example
    https://www.sslmentor.com/certum/certumcodecloudindividual. This costs $139 for 1 year, or
    $115 per year on a 3-year plan, before VAT.
- Buy it **as a private person**. The invoice goes to your own name and address, with no company
  details.
- Do **not** buy the €49 "Open Source Code Signing" product. It is only for open-source projects,
  the certificate says "Open Source Developer", and Somnus's code is private.
- Multi-year plans are delivered as yearly reissues. Since February 2026, individual certificates
  can be valid for at most 459–460 days.

### 2. Validate your identity (about 3 business days)

You will need two documents:

- **Photo ID:** your Cartão de Cidadão or passport, checked through Certum's automatic online
  verification (a selfie and a scan of the ID).
- **Proof of address in your own name:** a utility bill (electricity, gas, water or fixed internet)
  or a rental agreement.

If your bills are in someone else's name, ask Certum or the reseller which documents they accept
**before** you pay.

Your **full legal name** becomes the publisher name. Windows shows it in UAC prompts and in the
file's Properties, and this cannot be customized.

### 3. Activate SimplySign on your Windows PC (about 20 minutes)

1. Install the **SimplySign** mobile app (iOS or Android). Activate it with the QR code that
   Certum sends you. The app generates your one-time login codes.
2. Install **SimplySign Desktop** on the PC that builds Somnus.
   Instructions: https://www.files.certum.eu/documents/manual_en/Code-Signing-SimplySign-Instructions-for-activation-and-installation-v1.1.pdf
3. Log in to SimplySign Desktop (your email plus the 6-digit code from the phone app). The
   certificate then appears in your Windows certificate store as a virtual smart card.
4. Get the certificate's thumbprint in PowerShell:

   ```powershell
   Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert |
     Format-List Subject, Issuer, Thumbprint, NotAfter
   ```

   Copy the 40-character `Thumbprint` of the certificate issued by Certum.

### 4. Build a signed release

Open a **fresh PowerShell window** and make sure SimplySign Desktop is logged in. Then run:

```powershell
cd <repo>\apps\desktop

# Set this for THIS window only. Do NOT use setx: Somnus's in-app updater
# rebuilds the app on this same PC, and a permanent variable would make every
# update rebuild try to sign and fail whenever SimplySign is logged out.
$env:SOMNUS_WIN_SIGN_SHA1 = "PASTE_THUMBPRINT_HERE"

npm run signing:check        # should print: "mode": "cert-store"
npm run dist:win             # vite build + electron-builder --win (NSIS)
```

Optional settings:

- `$env:SOMNUS_WIN_SIGN_TIMESTAMP_URL`: the default is `http://time.certum.pl`.
- `$env:SIGNTOOL_PATH`: use your own Windows SDK `signtool.exe`. Without it, electron-builder
  downloads a Windows Kits bundle. The build pins `toolsets.winCodeSign=1.1.0`, which is a zip,
  so the old `winCodeSign-2.6.0.7z` symlink failure cannot happen.

### 5. Verify the result

```powershell
Get-AuthenticodeSignature .\release\Somnus-*-win-*.exe | Format-List Status, SignerCertificate, TimeStamperCertificate
Get-AuthenticodeSignature .\release\win-unpacked\Somnus.exe | Format-List Status
```

Both commands should report `Status : Valid` with a timestamp. Also right-click
`release\win-unpacked\Somnus.exe`, open **Properties**, and check that the **Details** tab still
shows the Somnus name and copyright and that the icon is still the Somnus icon.

### 6. Keep reputation growing

- Sign **every** release with the same certificate. Renew before the certificate expires, and
  avoid swapping certificates close to a release.
- If users report a false positive, submit the file at https://www.microsoft.com/wdsi/filesubmission
  (as a software developer).

Certum allows 5,000 signatures per month. A single release uses fewer than 10.

---

## Fallback: Azure Artifact Signing

Use this if you register a company, or if Microsoft opens individual validation to the EU. Check
https://learn.microsoft.com/azure/artifact-signing/quickstart#prerequisites for the current rules.

1. Create an Azure account with a **paid** subscription. Pay-as-you-go works; free, trial and
   sponsored subscriptions are rejected.
2. Register the `Microsoft.CodeSigning` resource provider, then create an **Artifact Signing
   account** (Basic SKU, $9.99 per month) in a region near you, for example West Europe. Note the
   account's **endpoint URI**, for example `https://weu.codesigning.azure.net/`.
3. Assign yourself the **Artifact Signing Identity Verifier** role. Then submit a **Public Trust
   identity validation**. An organization needs registration documents issued within the last 12
   months; an individual needs an ID whose name and address match the Azure billing account.
   Approval can take days.
4. Create a **Public Trust certificate profile** that uses the approved identity.
5. In Microsoft Entra ID, create an **app registration** with a client secret. On the certificate
   profile, grant it the **Artifact Signing Certificate Profile Signer** role.
6. Build from PowerShell. You also need PowerShell's `PSGallery`: electron-builder installs the
   `TrustedSigning` module into CurrentUser.

   ```powershell
   $env:SOMNUS_AZURE_SIGN_ENDPOINT  = "https://weu.codesigning.azure.net/"
   $env:SOMNUS_AZURE_SIGN_ACCOUNT   = "<artifact signing account name>"
   $env:SOMNUS_AZURE_SIGN_PROFILE   = "<certificate profile name>"
   $env:SOMNUS_AZURE_SIGN_PUBLISHER = "<CN on the certificate = your validated legal name>"
   $env:AZURE_TENANT_ID     = "<entra tenant id>"
   $env:AZURE_CLIENT_ID     = "<app registration client id>"
   $env:AZURE_CLIENT_SECRET = "<client secret>"   # or AZURE_CLIENT_CERTIFICATE_PATH
   npm run signing:check      # "mode": "azure"
   npm run dist:win
   ```

   Signing turns on only when the `SOMNUS_AZURE_SIGN_*` variables are set. The plain `AZURE_*`
   variables are not enough, because the app itself also reads them. If only some of the
   variables are set, the build stops with a list of the missing ones.

If both `SOMNUS_WIN_SIGN_SHA1` and the Azure variables are set, the thumbprint wins.

## Other options considered

These options are also in the comparison table in the report:

| Option | Cost per year | Why not the primary choice |
|---|---|---|
| **SSL.com IV (individual) + eSigner cloud** | $129 certificate + about $180 eSigner (or a $379 YubiKey, one time) | Eligible and works well in CI, but costs about 2× Certum. It works with this build through a signing hook or eSigner CKA, which puts the certificate in the store. |
| EV certificate (any CA) | $330–$450 or more | Organizations only, and since 2024 it gives no SmartScreen advantage. |
| SignPath Foundation | Free | Only for OSI-licensed open-source projects with no proprietary components. |
| Microsoft Store (MSIX) | Free for individuals since September 2025 | The Store signs the package and there is no SmartScreen prompt. But it needs MSIX packaging and Store review, and it does not fit Somnus's git-based self-update. |

## Known gap: updates rebuild the exe on the user's machine

Somnus does not update through electron-updater. An update runs `scripts/desktop-update/windows.ps1`,
which runs `hermes update` and then `hermes desktop --build-only`. That runs `electron-builder --dir`
**on the user's PC** and replaces `release\win-unpacked\Somnus.exe` with a freshly built,
**unsigned** exe. Your signing credentials never exist on that PC, so only the downloaded installer
and the exe it installs are signed.

- **SmartScreen:** no impact. SmartScreen only checks downloaded files marked with Mark-of-the-Web,
  and a file built locally has no such mark.
- **Smart App Control (Windows 11):** it can block the unsigned exe that the update rebuild
  produces. Upstream Hermes hit exactly this (NousResearch/hermes-agent#70544).
- **Real fix (future work):** ship prebuilt, signed `win-unpacked` payloads, or signed installers
  through electron-updater, instead of rebuilding on the client.
