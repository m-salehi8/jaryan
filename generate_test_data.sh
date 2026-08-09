#!/bin/bash
echo "Starting comprehensive test data generation in Docker..."
docker exec -it jaryan_backend python generate_test_data.py
echo "Done!"
