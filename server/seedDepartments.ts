/**
 * Seed script: creates all departments with name, icon, description.
 * Gen Ai Team (0402) and Content Writer Team (2213) have 4-digit access codes.
 * Run once: npm run seed:departments
 * Requires MONGO_DB_URI in .env or .env.local
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(root, '.env') });
dotenv.config({ path: path.join(root, '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import mongoose from 'mongoose';
import Department from './models/department/Department';

const DEPARTMENTS = [
  { name: 'Ask Anything', icon: '💬', description: 'Ask me anything - I respond perfectly to any query with accurate, helpful answers.', accessCode: '' },
  { name: 'Gen. AI Team', icon: '🧠', description: 'Expert systems for advanced logic and R&D.', accessCode: '0402' },
  { name: 'Create Prompts', icon: '✍️', description: 'Specialized Prompt Engineering space.', accessCode: '' },
  { name: 'Creative Studio', icon: '🎨', description: 'Visual storytelling and asset generation.', accessCode: '' },
  { name: 'Personal Research', icon: '📚', description: 'Deep data synthesis and knowledge extraction.', accessCode: '' },
  { name: 'Contenaissance Branding', icon: '✨', description: 'Real-time viral content strategies.', accessCode: '' },
  { name: 'Content Writer Team', icon: '📝', description: 'SEO-optimized articles and copywriting.', accessCode: '2213' },
];

async function seed(): Promise<void> {
  const mongoURI = process.env.MONGO_DB_URI;
  if (!mongoURI) {
    console.error('MONGO_DB_URI is not set. Add it to .env or .env.local');
    process.exit(1);
  }

  await mongoose.connect(mongoURI);
  console.log('MongoDB connected');

  for (const dept of DEPARTMENTS) {
    const updated = await Department.findOneAndUpdate(
      { name: dept.name },
      { $set: { icon: dept.icon, description: dept.description, accessCode: dept.accessCode || undefined } },
      { upsert: true, new: true }
    );
    console.log(`Department: "${updated.name}" ${updated.icon} – ${updated.accessCode ? `code: ${updated.accessCode}` : 'no code'}`);
  }

  console.log('Done. All departments seeded. Register with any department name.');
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
