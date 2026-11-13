# Anagu — Land Administration Platform & Figma Design Studio

An enterprise-grade land administration platform and interactive design studio built for the **Nigerian Land Use Act 1978** framework. Anagu eliminates boundary disputes, double-selling, and slow title registration through cryptographic title governance, surveyor cadastral validation, and customary family oracle attestations.

---

## Key Highlights

- **Human-Friendly Landing Page**: A clean, accessible public portal for landowners, buyers, and government officials to verify land titles instantly, understand the 4-step registration process, and search state cadastres.
- **Interactive Figma Design Studio**: Full in-browser design workspace featuring 10 production-grade artboards, zoom/pan canvas, layer navigator, CSS code inspector, and exportable design tokens.
- **Interactive Prototype Runner**: Experience the entire multi-role workflow:
  1. **Surveyor Cadastral GIS**: PostGIS boundary collision detection, 0.5m buffer zones, and coordinate beacon validation.
  2. **Community Oracle**: Family head and customary elder multi-sig attestations with collusion prevention.
  3. **Ministry Registrar**: Governor's Consent workflows and digital Certificate of Occupancy (C of O) issuance.
  4. **Public Registry**: Real-time QR code verification and immutable title history.
- **Zero Emojis / Pure SVG**: All visual markers, status icons, and maps use clean SVG icons (`lucide-react`).

---

## Tech Stack

- **Framework**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Build Tool**: [Vite](https://vitejs.dev/) (fast HMR and optimized production bundles)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Icons**: [Lucide React](https://lucide.dev/) (pure SVG components)
- **Animations**: [Motion](https://motion.dev/)

---

## Local Development

### 1. Clone & Install

```bash
git clone https://github.com/<your-username>/<your-repo-name>.git
cd <your-repo-name>
npm install
```

### 2. Run Locally

```bash
npm run dev
```

Open your browser at `http://localhost:3000`.

### 3. Build for Production

```bash
npm run build
npm run preview
```

---

## How to Push to Your GitHub

Follow these simple steps from your terminal:

```bash
# 1. Initialize git (if not already initialized)
git init

# 2. Add all files
git add .

# 3. Create your initial commit
git commit -m "Initial commit: Anagu Land Administration Platform"

# 4. Set the main branch
git branch -M main

# 5. Connect to your GitHub repository
git remote add origin https://github.com/<your-username>/<your-repo-name>.git

# 6. Push to GitHub
git push -u origin main
```

---

## Free Deployment to GitHub Pages

Once your code is pushed to GitHub, enable live hosting directly in your browser:

1. Go to your repository on **GitHub**.
2. Click **Settings** > **Pages** (in the left sidebar).
3. Under **Build and deployment** > **Source**, select **GitHub Actions** and click **Configure** on the suggested static workflow (or create a workflow directly in GitHub's **Actions** tab to build `npm run build` and upload `./dist`).
4. Your live site will publish to `https://<your-username>.github.io/<your-repo-name>/`!

*(Note: `.github/workflows` was intentionally excluded from the starter files so OAuth-based GitHub publishing tools never reject your push due to missing `workflow` token scopes.)*

---

## Alternative Deployments

### Deploy with Vercel or Netlify
- Import your GitHub repository into **[Vercel](https://vercel.com)** or **[Netlify](https://netlify.com)**.
- Build command: `npm run build`
- Output directory: `dist`
- No extra configuration needed.

### Deploy with Docker
Run with Docker anywhere:

```bash
docker build -t anagu-platform .
docker run -p 8080:80 anagu-platform
```
Open `http://localhost:8080`.

---

## Project Structure

```text
├── public/                     # Static assets
├── src/
│   ├── assets/                 # Generated cadastral & architecture imagery
│   ├── components/
│   │   ├── figma/              # Design studio canvas, sidebars & toolbar
│   │   └── screens/            # Production screens & Landing Page
│   ├── data/                   # Mock parcels, audits, design tokens
│   ├── types/                  # TypeScript data interfaces
│   ├── App.tsx                 # Root layout & view controller
│   └── main.tsx                # React entrypoint
├── Dockerfile                  # Production container definition
├── nginx.conf                  # Production SPA web server configuration
└── vite.config.ts              # Vite configuration with relative base path
```

---

## License

MIT License. Designed and developed for next-generation statutory land administration.
