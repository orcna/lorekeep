# LoreKeep - Local-First Architecture

Your app is now **completely local** with optional Firebase backup.

## Architecture Overview

```
┌─────────────────────────────────────────┐
│          Browser                        │
├─────────────────────────────────────────┤
│  React App with Local Storage           │
│  (Universes, Lore, Maps, Chat)         │
└───────────┬───────────────────┬─────────┘
            │                   │
            ▼                   ▼
    ┌──────────────┐    ┌──────────────┐
    │ localStorage │    │   Firebase   │
    │  (Primary)   │    │ (Backup)     │
    │              │    │ (Optional)   │
    └──────────────┘    └──────────────┘
```

## How It Works

### 1. **Local Storage** (Primary)
All your data is stored in browser's `localStorage`:
- Universes
- Lore entries
- Chat history
- Map markers
- Settings

Data persists across browser sessions automatically.

### 2. **User ID** (Local)
Each user gets a unique local ID:
```
local_[timestamp]_[random]
```
Stored in `localStorage` key: `lorekeep_user_id`

### 3. **Authentication** (No Server Required)
Simply click:
- **"Enter Archive"** - Local user (named or anonymous)
- **"Guest Mode"** - Temporary guest session

Both work 100% offline.

## API Reference

### Local Storage Functions

#### Universes
```typescript
// Create
const universe = createUniverse("My World", "Description")

// Get all
const universes = getUniverses()

// Update
updateUniverse(id, "New Name", "New Description")

// Delete
deleteUniverse(id)
```

#### Lore Entries
```typescript
// Add
const entry = addLoreEntry({
  title: "Character Name",
  content: "Description...",
  category: "character",
  userId: getCurrentUserId(),
  universeId: universe.id
})

// Get for universe
const lore = getLoreForUniverse(universeId)

// Update
updateLoreEntry(id, { title: "New Title" })

// Delete
deleteLoreEntry(id)
```

#### Chat Messages
```typescript
// Add message
const msg = addChatMessage({
  text: "Hello",
  role: "user",
  userId: getCurrentUserId(),
  universeId: universeId
})

// Get history
const messages = getChatMessages(universeId)
```

#### Map Markers
```typescript
// Add marker
const marker = addMapMarker({
  loreId: loreEntry.id,
  universeId: universe.id,
  x: 50 // percentage
  y: 50 // percentage
  userId: getCurrentUserId()
})

// Get markers
const markers = getMapMarkers(universeId)
```

## Data Export/Import

### Export All Data
```typescript
import { exportData } from './lib/localStorage'

const jsonData = exportData()
// Download to file or email
```

### Import Data
```typescript
import { importData } from './lib/localStorage'

importData(jsonData) // Restores everything
```

## Firebase Backup (Optional)

Firebase is **optional** - the app works without it!

### When Firebase is Available:
✅ Data syncs to Firebase  
✅ Can restore from backup  
✅ Access data from other devices  

### When Firebase is Not Available:
✅ App still works 100%  
✅ Data stored locally  
✅ Can sync later when Firebase is available  

To enable Firebase sync, implement in `src/lib/firebase.ts`:
```typescript
export async function syncToFirebase(data: any): Promise<boolean> {
  // Implement sync logic here
  // Add code to sync local data to FB
}
```

## Development

### Start Dev Server
```bash
npm run dev
```
Visit: `http://localhost:3000`

### Build for Production
```bash
npm run build
```

### Type Check
```bash
npm run lint
```

## Storage Limits

Browser localStorage limits:
- **Chrome/Firefox**: ~10MB per site
- **Safari**: ~5MB per site
- **Edge**: ~10MB per site

For large datasets, implement **IndexedDB** instead (unlimited storage).

## Backup Strategy

### 1. Manual Backup (Recommended)
Users can export data anytime:
```
Settings > Export Data > Download JSON
```

### 2. Cloud Backup (Optional)
Sync to Firebase for cloud storage.

### 3. Browser Backup
Browser keeps localStorage across sessions automatically.

## File Structure

```
src/
├── lib/
│   ├── localStorage.ts  ← All local storage functions
│   ├── firebase.ts      ← Optional Firebase (gracefully fails)
│   ├── aiProvider.ts    ← Ollama AI
│   └── types.ts         ← TypeScript types
│
├── contexts/
│   └── UniverseContext.tsx  ← Uses localStorage only
│
├── components/
│   ├── Login.tsx        ← Local auth (no Firebase required)
│   ├── LoreManager.tsx
│   ├── Oracle.tsx
│   └── [other components]
│
└── App.tsx              ← Uses local auth
```

## Troubleshooting

### "Data disappeared"
- Check browser isn't in private/incognito mode
- Check browser storage settings allow localStorage
- Try exporting data: `exportData()`

### Browser storage full
- Clear old data: `deleteUniverse(id)`
- Check browser console: `JSON.parse(localStorage.getItem('lorekeep_local_db')).length`

### Want to switch backends
- Edit `localhost.ts` to use IndexedDB instead
- Firebase integration ready in `firebase.ts`

## Migration Path

If you want to add real backend later:

1. Export local data to JSON
2. Import to Firebase/PostgreSQL/etc
3. Update `UniverseContext` to use new backend
4. Keep localStorage as cache layer

## Security

⚠️ **Note**: localStorage is NOT encrypted  
- Don't store sensitive passwords
- Data is readable in dev tools
- Add encryption layer if needed: `crypto.subtle.encrypt()`

## Performance Tips

1. **Keep universes organized** - Fewer items = faster
2. **Archive old chat histories**
3. **Export large datasets** periodically
4. **Monitor browser memory** - Chrome DevTools > Storage

---

**No server needed. No API keys. No limits. 100% offline.**
