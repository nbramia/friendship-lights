# iOS Shortcuts Setup

Create 7 shortcuts. Each one is identical except for the token and body.

---

## How to Create Each Shortcut

1. Open **Shortcuts** app
2. Tap **+** (top right)
3. Tap **Add Action**
4. Search for **"Get Contents of URL"** and tap it
5. Configure (see below)
6. Tap the name at top → rename it
7. Tap **Done**

### Configuration for "Get Contents of URL"

**URL:** (tap to edit)
```
https://friendship-lights.nbramia.workers.dev/signal
```

**Method:** Tap "GET" → change to **POST**

**Headers:** Tap "Headers" → Add 2 headers:

| Key | Value |
|-----|-------|
| Authorization | Bearer [YOUR TOKEN - see secrets.md] |
| Content-Type | application/json |

**Request Body:** Tap "Request Body" → select **JSON** → tap "Add new field":
- Add each key/value from the body below

---

## The 7 Shortcuts

> **Note:** Get the actual tokens from `secrets.md` (not committed to git)

### 1. Nathan → Girlfriend
**Name:** Signal Girlfriend

**Effect:** girlfriend_outlet ON, nathan_outlet OFF

**Body:**
| Key | Type | Value |
|-----|------|-------|
| action | Text | nathan_signal |

---

### 2. Partner → Nathan
**Name:** Signal Nathan

**Effect:** nathan_outlet ON, partner_outlet OFF

**Body:**
| Key | Type | Value |
|-----|------|-------|
| action | Text | partner_signal |

---

### 3. Daughter → Grandparents
**Name:** Signal Grandparents

**Effect:** grandparents_outlet ON, daughter_bulb OFF

**Body:**
| Key | Type | Value |
|-----|------|-------|
| action | Text | daughter_signal |

---

### 4. Mom → Daughter (RED)
**Name:** Signal Daughter

**Effect:** daughter_bulb RED, grandparents_outlet OFF

**Body:**
| Key | Type | Value |
|-----|------|-------|
| action | Text | grandparents_signal |
| color | Text | red |

---

### 5. Dad → Daughter (BLUE)
**Name:** Signal Daughter

**Effect:** daughter_bulb BLUE, grandparents_outlet OFF

**Body:**
| Key | Type | Value |
|-----|------|-------|
| action | Text | grandparents_signal |
| color | Text | blue |

---

### 6. Admin → All Off
**Name:** All Lights Off

**Effect:** All 5 devices OFF

**Body:**
| Key | Type | Value |
|-----|------|-------|
| action | Text | all_off |

---

### 7. Admin → Grandparents Off
**Name:** Grandparents Off

**Effect:** grandparents_outlet OFF only

**Body:**
| Key | Type | Value |
|-----|------|-------|
| action | Text | plug_off |
| target | Text | grandparents_outlet |

---

## Add to Home Screen

After creating each shortcut:
1. Long-press the shortcut
2. Tap **Details**
3. Tap **Add to Home Screen**

## Share to Others

1. Tap **⋯** on the shortcut
2. Tap **Share** (bottom)
3. AirDrop or copy iCloud link
