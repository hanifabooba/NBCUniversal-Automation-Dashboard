# NBCuniversal Automation Execution – Demo App (Angular + Express, TypeScript)

This is a starter implementation of the NBCuniversal Automation Execution web app with:

- Angular 19 frontend (standalone components)
- Express + TypeScript backend
- Dummy images and in-memory data
- Basic public flows (home, products, enquiry)
- Simple staff flows (login, employee tasks, manager dashboards)

## Prerequisites

On your Mac (as you shared):

- Node: 23.8.0
- npm: 10.9.2
- Angular CLI: 19.2.14 (`npm install -g @angular/cli@19.2.14`)

## 1. Install Dependencies

From the root of the project:

```bash
npm install   # runs frontend & backend install via root scripts
```

If that fails, you can run them separately:

```bash
npm run frontend:install
npm run backend:install
```

## 2. Run in Development (Frontend + Backend)

From the project root:

```bash
npm run dev
```

This will:

- Start Angular dev server on http://localhost:4200
- Start backend on http://localhost:3000 (if you adjust scripts later)

In this starter, `frontend` is set up to call `/api/products` relative to the same origin, so during pure dev you can:

- Either set up a proxy in Angular (proxy.conf.json)
- Or run Angular and point it at the backend URL

For now, the easiest is:

- Build the Angular app
- Serve it from Express in a later step (to be wired)

## 3. Build Frontend & Backend

```bash
npm run build
```

This will:

- Build Angular into `frontend/dist/nbcuniversal-frontend`
- Compile backend TypeScript to `backend/dist`

## 4. Run Backend Only (after build)

```bash
npm run start-backend
```

This starts Express on port 3000. In production/Heroku, you would adjust Express to serve the Angular `dist` folder.

## Notes

- The images in `frontend/src/assets/images/*.png` are dummy placeholders.
- Product and task data is in-memory in `backend/src/server.ts` for now.
- You can refine authentication, tasks API, and file uploads on top of this structure.
