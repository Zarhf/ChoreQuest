# Specifications: ChoreQuest (formerly Frequence Menage)

## 1. Concept
**Level up your home, one quest at a time.**
ChoreQuest is a gamified Progressive Web App (PWA) that transforms boring household chores into an epic RPG adventure. Track tasks, earn XP, and level up with your family while keeping your data private and synced via your own Google Drive.

## 2. Key Features

### 2.1. Task Management (The "Quest Log")
*   **Definition:** Task Name, Description, Difficulty (XP/Points).
*   **Frequency:**
    *   Recurring (e.g., "Do the dishes" - Daily).
    *   Periodic (e.g., "Change sheets" - Every 15 days).
    *   One-off (e.g., "Fix the shelf").
*   **Status:** To Do (with urgency/delay indicator), Done.

### 2.2. Collaboration (The "Party")
*   **Hosted Mode:** One user creates the "House" (JSON file on their Drive).
*   **Guests:** Other members connect to the shared file.
*   **Assignment:** Ability to assign a task to oneself ("I take this quest") or to someone else.

### 2.3. Gamification (RPG)
*   **Profiles:** Each member has an avatar and a level.
*   **XP & Levels:** Completing a task grants XP. Leveling up unlocks titles or rewards (defined by the household, e.g., "Movie night choice").
*   **Leaderboard:** Weekly/Monthly ranking (optional, for healthy competition).
*   **History:** "Adventure Log" of completed tasks.

## 3. Technical Architecture

*   **Foundation:** Based on `PWA_Drive_Architecture`.
*   **Frontend:** HTML5, CSS (Modern, Responsive), Vanilla JS.
*   **Hosting:** GitHub Pages.
*   **Backend / Storage:** Google Drive API v3 (Serverless).
*   **Data Model:**
    *   Single file: `chorequest_db.json`.

### JSON Structure (Draft)
```json
{
  "meta": {
    "version": 1,
    "last_updated": "2023-10-27T10:00:00Z",
    "updated_by": "user_id_1"
  },
  "users": [
    { "id": "u1", "name": "Dad", "xp": 1200, "level": 5, "avatar": "🛡️" },
    { "id": "u2", "name": "Mom", "xp": 1450, "level": 6, "avatar": "🔮" }
  ],
  "tasks": [
    {
      "id": "t1",
      "title": "Empty Dishwasher",
      "xp_reward": 50,
      "frequency_days": 1,
      "last_done": "2023-10-26T20:00:00Z",
      "last_done_by": "u1"
    }
  ]
}
```

## 4. UX / UI (Design)
*   **Mobile First:** Native app feel.
*   **Visual:** Clean RPG / Adventure Map style.
*   **Interactions:** Swipe to complete, sound effects (optional).
