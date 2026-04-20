# Race Control - Frontend

🏁 **Race Control Minimal** - Professional motorsport management system frontend.

## Theme

- **Primary**: Black / Dark Gray
- **Accent**: Racing Orange (#F05323)
- **Text**: White / Light Gray
- **Style**: Flat design, large buttons, high contrast, minimal animations
- **Approach**: Mobile-first, backend-agnostic

## Pages

1. **Login Page** (`/login`) - User authentication (UI only)
2. **Signup Page** (`/signup`) - Create users (Admin/Owner use only)
3. **Event List Page** (`/events`) - Select race event
4. **Run Group Display Page** (`/run-group`) - Show assigned run group (read-only)

## Getting Started

### Install Dependencies

```bash
npm install
```

### Run Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:3000`

### Build for Production

```bash
npm run build
npm start
```

## Tech Stack

- Next.js 14 (App Router)
- React 18
- Pure CSS (no frameworks)

## Project Structure

```
app/
  ├── layout.jsx          # Root layout with global styles
  ├── page.jsx            # Home page (redirects to /login)
  ├── login/
  │   ├── page.jsx
  │   └── Login.css
  ├── signup/
  │   ├── page.jsx
  │   └── Signup.css
  ├── events/
  │   ├── page.jsx
  │   └── EventList.css
  └── run-group/
      ├── page.jsx
      └── RunGroupDisplay.css
```

## Notes

- All pages are UI-only (no backend integration yet)
- Backend API integration can be added easily later
- Mobile-first responsive design
- Clean, minimal motorsport aesthetic
- Uses Next.js App Router for file-based routing
- relase 23-01-2026

## Vercel Deployment

- Set `NEXT_PUBLIC_API_URL` in Vercel to your deployed backend URL, for example `https://api.example.com/api/v1`.
- The `/api/v1` proxy rewrite is enabled only during local development.
- If the backend is not deployed yet, the UI can still be previewed, but login and data-driven screens will need the API to be online.
