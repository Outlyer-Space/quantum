# Overview

Quantum is a collaborative procedure management application used by ground operators during test/flight for launch vehicles or satellites. Procedures are sequences of tasks to be executed for implementing a mission by multiple operators with different assigned roles. Quantum includes a library of available procedures, live execution, and an "as-run" archive. It was originally developed by a Silicon Valley based startup called Audacy which shut down in 2019.

Quantum consists of a modular front-end (UI), and a REST API backend. The application is browser based using the MEAN technology stack (MongoDB, Express, Angular 21, NodeJS).

## Purpose

Quantum is intended as a minimalist turn-key solution for test and flight operations procedure management. While originally developed for spaceflight operations, it should be equally suitable to any other activity where multiple & geographically distributed people need to execute a real-time activity in a structured, repeatable, and auditable manner.

---

## 🚀 Quick Start — Docker Development Setup (NEW)

### Requirements

- **Docker**
  - Windows/macOS: Docker Desktop → <https://www.docker.com/products/docker-desktop/>
  - Linux: Docker Engine → <https://docs.docker.com/engine/install/>
- **Git Bash (Windows only)** to run shell scripts (`.sh`) → <https://git-scm.com/download/win>

> **Tip (Windows):** In File Explorer, right-click the project folder and choose **“Git Bash Here”** to open a Bash shell in the repo root.

---

### 1) Ensure Docker is running

Start Docker Desktop (Windows/macOS) or the Docker daemon (Linux).

---

### 2) Open a shell in the repo root

- **Windows (Git Bash):**

  ```bash
  pwd   # should end with /Quantum
  ```

- **Linux / macOS:**

  ```bash
  cd /path/to/Quantum
  ```

---

### 3) Bring the stack up (recommended)

After making sure Docker is running, run the following command inside Git Bash (Windows) or your regular terminal if you're on Linux:

```bash
./quantum.sh up
```

- Runs `docker compose up --build -d` using the Angular full-stack compose file.
- Builds and starts **MongoDB**, the **Node.js API**, and the **Angular 21 frontend** with a production build served via Nginx.
- Angular frontend is served on **port 4201**; the API remains on **port 3000**.

---

### 4) Alternative: dev hot-reload style (Node API only)

```bash
./quantum.sh docker
```

Runs the Quantum API image and **bind-mounts** `./node → /node`, so local edits to the backend are reflected inside the container (useful for API-only development without rebuilding the Angular frontend).

---

### 5) Open the app

- Navigate to **<http://localhost:3000>**

### 6) Default login (first run)

Use the built-in credentials:

```text
AUTH_CLIENT_ID     = sys.admin@localhost
AUTH_CLIENT_SECRET = 2infinity
```

---

## Script usage (for reference)

```text
Usage: ./quantum.sh [command]
  up            docker compose up --build -d  (Node-only stack — DEPRECATED)
  down          docker compose down           (Node-only stack — DEPRECATED)
  docker        Run built image, mounting ./node (API dev hot-reload)
  deploy        Run built image without mounting source (prod-like)
  build         docker build -t ${IMAGE} -f ${DOCKERFILE} ${CONTEXT}
  clean         Remove container and image
  rebuild       Clean + build
  debug         Run node directly on host (dev)
  pm2           Run with pm2 on host (dev)

Env: IMAGE, CONTAINER, DOCKERFILE, CONTEXT, PULL=true
```

**Which should I use?**

- **First time / most users:** `./quantum.sh up`
- **API-only development:** `./quantum.sh docker`
- **Rebuild only:** `./quantum.sh build`
- **Stop everything:** `./quantum.sh down`

---

### Creating a `secrets.env` file (Production)

This is a **mock `secrets.env` file** you can create and include to get the system up and running in a **local development environment** or to setup for a **Production** setting.
It assumes access is hosted through a **local MongoDB instance** (the one running inside the container) and **not** through Azure services, although the latter is still possible.

**Important notes:**

1. Do **not** quote values.
2. Values cannot contain spaces.
3. Save the file as **`secrets.env`**.

```env
# Node running mode
NODE_ENV=development

# Database credentials - LOCAL MongoDB (no auth needed)
MONGO_DB_URL=mongodb://mongo:27017/quantum
MONGO_DB_USR=
MONGO_DB_PWD=

# User authentication via LOCAL MongoDB (not Microsoft Azure)
AUTH_PROVIDER=Mongo
AUTH_TENANT_ID=
AUTH_CALLBACK_URL=
AUTH_CLIENT_ID=sys.admin@localhost
AUTH_CLIENT_SECRET=2infinity
```

## 🛠️ Troubleshooting

- **Windows asks “which app to open .sh with?”**
  `.sh` files need **Git Bash** (or WSL). Open **Git Bash** in the repo root and run the commands there.

- **`$'\r': command not found` in Git Bash**
  Convert Windows line endings once:

  ```bash
  dos2unix start.sh setup.sh
  ```

- **Re-run without rebuilding**

  ```bash
  docker compose up -d
  ```

  Use `--build` again only after Dockerfile/code changes.

---

## 📚 Documentation

For getting started, use the **Quick Start** above, or refer to the following for more details:

 1. [Users Guide](https://github.com/Outlyer-Space/quantum/wiki/User-Guide) - how to use
 1. [Admin Guide](https://github.com/Outlyer-Space/quantum/wiki/Admin-Guide) - how to install/admin
 1. [Developer Guide](https://github.com/Outlyer-Space/quantum/wiki/Dev-Guide) - how to contribute

## License

Quantum is released under the MIT License (see [LICENSE](/LICENSE)).
