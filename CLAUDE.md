# Project: sewardwi.github.io — Personal Website / Portfolio

## Overview
This is William Seward's personal website hosted on GitHub Pages. It serves as a portfolio and a place to explore and share personal interests.

## Site Architecture
- **Home page**: `index.html` at the project root — links to all interest/topic sections
- **Interest sections**: Each major interest gets its own top-level folder (e.g., `quantum/`, `baseball/`, etc.) with its own `index.html` and sub-pages
- **Navigation**: Every page must include a shared nav bar linking to all main pages (Home, Quantum, Baseball, and any future sections)

## Current Sections
- `quantum/` — Quantum computing visualizations and content
  - `quantum/simple-visualizations/` — Interactive React-based quantum visualizations (Bloch sphere, qubit complex plane)

## Tech Stack
- Plain HTML, CSS, JavaScript (no build tools)
- Tailwind CSS via CDN
- React 18 via CDN with Babel standalone for JSX
- Static site hosted on GitHub Pages
- Uses React for any new components/pages

## Conventions
- Keep it simple: CDN-based dependencies, no npm/bundler setup
- Each section folder should have its own `index.html` as the entry point
- New sections should follow the same pattern as `quantum/`: a folder at the root with an `index.html`
- When adding a new section, also add it to the nav bar on **all** existing pages

## Adding a New Interest/Section
1. Create a new top-level folder (e.g., `baseball/`)
2. Add an `index.html` inside it
3. Update the nav bar component/snippet on every page to include the new section
4. Add a link to the new section from the home page (`index.html`)
