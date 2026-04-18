#!/bin/bash
# Satyabot Execution Script
# Note: Comments inside this shell script are kept for execution context,
# but all JS comments have been stripped from the actual application code.

echo "Ready to initialize your SatoshiBot environment..."


echo "Step 1: Making sure all dependencies are accounted for..."
npm install > /dev/null 2>&1

echo "Step 2: Importing and analyzing your specified model dataset..."
echo "-> You will see the dataset processing logs outputted below:"
npm run import:dataset
if [ $? -ne 0 ]; then
    echo "Failed at importing the dataset. Check output above."
    exit 1
fi

npm run analyze:dataset
if [ $? -ne 0 ]; then
    echo "Failed at analyzing the dataset. Check output above."
    exit 1
fi


echo "Step 3: Staring up the Satyabot server!"
echo "-> Expected Output Location: Application is logging to terminal below."
echo "-> The web API runs gracefully on http://localhost:5000"
echo "-> You can check health here: http://localhost:5000/health"


npm run start
