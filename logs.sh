#!/bin/bash
set -e

CONTAINER_NAME="stocktraders-dashboard-container"

docker logs -f "$CONTAINER_NAME"
