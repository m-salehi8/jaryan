const fs = require('fs');

let chat = fs.readFileSync('src/pages/Chat.js', 'utf8');
chat = chat.replace('hover:bg-neutral-800 text-white', 'hover:opacity-90 text-primary-foreground');
fs.writeFileSync('src/pages/Chat.js', chat);

let tour = fs.readFileSync('src/components/onboarding/ProductTour.js', 'utf8');
tour = tour.replace('hover:bg-neutral-700', 'hover:opacity-90');
fs.writeFileSync('src/components/onboarding/ProductTour.js', tour);
