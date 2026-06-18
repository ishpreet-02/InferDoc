FROM ubuntu:24.04

# Prevent interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive

# Install Python 3.12, pip, and curl
RUN apt-get update && apt-get install -y \
    python3.12 \
    python3-pip \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install uv for fast dependency resolution
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin/:$PATH"

# Copy package configurations
COPY pyproject.toml uv.lock ./

# Sync dependencies using uv
RUN uv pip install --system -r pyproject.toml

# Copy the rest of the application
COPY . .

# Run the FastAPI app, binding to Render's dynamic PORT
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
