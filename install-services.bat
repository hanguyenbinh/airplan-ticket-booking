@echo off
echo Installing dependencies for all services...

cd /d "c:\Users\Binh\OneDrive\Desktop\airline-booking\booking-service"
echo Installing booking-service...
npm install

cd /d "c:\Users\Binh\OneDrive\Desktop\airline-booking\inventory-service"
echo Installing inventory-service...
npm install

cd /d "c:\Users\Binh\OneDrive\Desktop\airline-booking\notification-service"
echo Installing notification-service...
npm install

cd /d "c:\Users\Binh\OneDrive\Desktop\airline-booking\pricing-service"
echo Installing pricing-service...
npm install

cd /d "c:\Users\Binh\OneDrive\Desktop\airline-booking\search-service"
echo Installing search-service...
npm install

echo All services installed successfully!
pause
