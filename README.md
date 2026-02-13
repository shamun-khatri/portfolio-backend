```
npm install
npm run dev
```

```
npm run deploy
```

## Migration Recovery (Neon)

Before migration history fixes, create a backup first:

```
npm run env -- node scripts/backup-neon.js
```

If Prisma migration history drifts, the safe recovery flow used in this project is:

1. Backup data.
2. Rebaseline migrations (single baseline migration from current schema).
3. Mark baseline as applied.
4. Run `npm run env -- prisma migrate status` to confirm clean state.

Backups are intentionally ignored in git via `.gitignore`.
