# The Bunker East – Monday League: setup guide

## Your live setup (Nov 25, 2026)

- **Site:** https://beaudette356-droid.github.io/monday-league/
- **Code:** https://github.com/beaudette356-droid/monday-league (GitHub Pages, `main` branch, root)
- **Firebase project:** `bunker-east-league` (Spark plan, Firestore in Montréal)
- **Done:** steps 1–6. Email/password sign-in on, database created, rules published, web app registered, settings in `config.js`, league password set, site uploaded, Pages on, github.io domain authorized.
- **Still to do:** steps 7–10 (create your account, make yourself organizer, add Mondays and the first course, invite players).

In the newer Firebase console layout, Authentication is under **Security**, and Firestore is under **Databases & Storage**.

This gets the league site live on **GitHub Pages** (free hosting) with **Firebase** (free logins and database).
Plan on about 20 minutes. Do the steps in order.

## What's in this folder

| File | What it is |
|---|---|
| `index.html` | Sign-in page (the landing page), with Create account below it |
| `book.html` | Booking page: Mondays, course of the week, Bays 3 & 4, early and late |
| `admin.html` | Organizer page: players and contact details, weekly courses, bookings, settings |
| `config.js` | Firebase settings (already filled in for `bunker-east-league`) and the bay/time layout |
| `firestore.rules` | Security rules you paste into Firebase |
| `style.css`, `hero.jpg`, `favicon.svg` | Styles, the header photo and the browser-tab icon |
| `common.js`, `login.js`, `book.js`, `admin.js` | The site code |
| `firebase.js` | A bundled copy of the Firebase SDK (v13.3), so nothing loads from a CDN |

---

## 1. Create the Firebase project

1. Go to <https://console.firebase.google.com> and sign in with your Google account.
2. Click **Create a project** (or **Add project**). Name it something like `bunker-east-league`.
3. Turn **Google Analytics off**, as you don't need it. Click **Create project**.

The free **Spark** plan is the default. No credit card is needed.

## 2. Turn on email + password sign-in

1. In the left menu: **Build › Authentication › Get started**.
2. On the **Sign-in method** tab, click **Email/Password**, switch on the first toggle (**Email/Password**), and leave "Email link" off. Click **Save**.

## 3. Create the database and paste the rules

1. Left menu: **Build › Firestore Database › Create database**.
2. Pick the **Standard** edition if asked. For location, choose **northamerica-northeast1 (Montréal)**; it's closest to Ottawa and can't be changed later.
3. Choose **Start in production mode**, then **Create**.
4. Open the **Rules** tab. Delete everything there, paste the **entire contents of `firestore.rules`**, and click **Publish**.

## 4. Connect the site to Firebase

1. Click the **gear icon › Project settings**. Under **Your apps**, click the **web icon `</>`**.
2. Nickname: `league-site`. Leave "Firebase Hosting" **unchecked**. Click **Register app**.
3. Firebase shows a block that starts with `const firebaseConfig = {`. Copy the six values (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`).
4. Open **`config.js`** in a text editor and replace the placeholder values with yours. Save.

These values aren't secret. They identify your project, and the security rules from step 3 are what protect the data.

## 5. Set the league password

1. Go to **Firestore Database › Data**. Click **+ Start collection**.
2. Collection ID: `secrets` → **Next**.
3. Document ID: `league`.
4. Add one field: name `code`, type **string**, value = the league password you'll give players (for example `bunker-east-2026`).
5. Click **Save**.

You can change it later from the site's Admin › Settings page.

## 6. Put the site on GitHub Pages

1. Sign in at <https://github.com>. Click **+ › New repository**.
2. Name it `monday-league`, set it to **Public** (free Pages needs a public repo; nothing secret is in these files), and click **Create repository**.
3. On the new repo page, click **uploading an existing file**. Drag in **every file in this folder**. Click **Commit changes**.
4. Go to **Settings › Pages**. Under **Build and deployment**, set Source to **Deploy from a branch**, branch **main**, folder **/ (root)**, then **Save**.
5. After a minute or two the page shows your link, for example `https://YOUR-USERNAME.github.io/monday-league/`.

Then, back in Firebase: **Authentication › Settings › Authorized domains › Add domain**, and add `YOUR-USERNAME.github.io`.

## 7. Create your own account

Open your site link, click **Create account**, and sign up with your name, email, phone, a password, and the league password from step 5.
You'll land on the booking page. There are no Mondays yet; that's next.

## 8. Make yourself the organizer

1. In Firebase: **Authentication › Users**. Find your email and copy the **User UID** (hover the row to see the copy button).
2. **Firestore Database › Data › + Start collection**. Collection ID: `admins` → **Next**.
3. Document ID: **paste your User UID**. Add a field `name` (string) = `Robert B.`. **Save**.
4. Refresh the booking page. An **Admin** button appears in the top bar.

To add more organizers later, use Admin › Settings; you won't need the console again for this.

## 9. Add the Mondays and the first course

1. On the site, open **Admin › Weekly courses**.
2. Under **Add a Monday**, pick **Nov 30, 2026**, set **How many weeks** to `8`, and click **Add**. That creates Nov 30 through Jan 18.
3. Click **Set course** on Nov 30 and fill in:
   - Course name: `Mammoth Dunes`
   - TrackMan image link: `https://cdn.trackmangolf.com/course-resources/mammothdunes_Splash_6517bd97-f6ab-4b6b-971d-4fe515a3d4e2`
   - Location: `Sand Valley · Wisconsin, US`
   - Par `73`, Yards `6,389`, Difficulty `3 of 5`
   - Signature hole or note: `No. 8, a par 3 to a green ringed by sand instead of water.`
   - Short description: a sentence or two of your choice
4. Click **Save**. Players see it right away.

**Finding a course image link later:** go to <https://www.trackman.com/golf/simulator/courses>, search the course, and open it. Right-click the big picture, choose **Copy image address**, and paste it. If the copied address starts with `https://www.trackman.com/_next/image?url=`, the real link is the part after `url=` (it starts with `https%3A%2F%2Fcdn.trackmangolf.com`). Replace `%3A` with `:` and each `%2F` with `/`, and drop everything from `&w=` onward.

## 10. Invite the players

Send the league your site link and the league password. Players create their own accounts and book.

---

## Day-to-day

- **Who signed up, emails, phones:** Admin › Players. You can also **Copy all emails** or **Download CSV**.
- **Someone can't make it / called you to book:** Admin › Bookings. Pick the Monday and remove or add them.
- **Close a bay (release it to The Bunker):** Admin › Bookings › **Close bay to players** (tap twice), or **Close 8 – 11 PM (both bays)** at the top. Players see it as Closed and can't book or join its waitlist; anyone already booked stays booked. **Reopen bay** undoes it.
- **Automatic Friday release:** right after midnight Friday (between 12 and 1 AM Saturday), any bay with **nobody** booked for the coming Monday is closed automatically, and matt@golfbunker.ca gets one email listing the bays being released (you're copied, replies come to you). A bay with even one player stays open. You also get a summary. To see what it would do right now, run `previewRelease` in the Apps Script editor. To change Matt's address, edit `FACILITY_EMAIL` at the top of the script.
- **Move or swap players:** Admin › Bookings › **Move / swap…** next to a name. Move them to a bay with room, or swap them with someone in a full bay (both bays keep the same count). Picking an already-booked player in **Add a player…** moves them from their current bay.
- **New course list:** Admin › Weekly courses › Set course.
- **Change the league password:** Admin › Settings. People already signed up aren't affected.
- **Remove a player:** Admin › Players › Remove (tap twice). To also delete their login, go to Firebase › Authentication › Users.
- **Backstop:** everything is visible in the Firebase console (Authentication for logins, Firestore › Data for profiles, weeks and bookings), even if the site is down.

## Changing the site later

Edit the files and upload the changed ones to the GitHub repo (**Add file › Upload files**, same names, **Commit**). Pages republishes within a minute or two.
Bay numbers, times and the 4-per-screen cap live at the top of `config.js`. If you change bays or times, also update the matching values in `firestore.rules` (`'early', 'late'` and `[3, 4]`) and republish the rules.

## Good to know

- **Free-tier headroom:** Firestore's free daily allowance (tens of thousands of reads and writes) is far beyond what a league uses.
- **Password resets** are emailed from a `firebaseapp.com` address and sometimes land in spam. You can reword that email under Authentication › Templates.
- **One booking per Monday** is enforced by the site, which moves you if you book another bay. The security rules cap each bay at 4 and only let players add or remove themselves, so nobody can bump someone else.
- **Test it on your computer first (optional):** in this folder, run `python3 -m http.server 8000` and open <http://localhost:8000>. `localhost` is already an authorized domain in Firebase.

## Security check (Nov 25, 2026)

- **GitHub secret-scanning alert:** it flagged the Firebase web API key in `config.js`. That key is meant to be public: it is the auto-created Firebase **Browser key**, limited to 25 Firebase APIs, with no Gemini / Generative Language API.
- **Website restriction added** (Google Cloud › APIs & Services › Credentials › Browser key). Allowed sites: `https://beaudette356-droid.github.io/*`, `https://bunker-east-league.firebaseapp.com/*`, `http://localhost:8000/*`. Tested: works from the live site, refused (403) from another website. If you ever test locally on a different port, add it there.
- **Rules tested with no login:** reads of players, a player profile, the league password, organizers, Mondays and bookings were all refused (403), and so was creating a player profile.
- **GitHub alert:** safe to close as a false positive (public Firebase web key, restricted, protected by security rules).

## Email reminders (set up Nov 25, 2026)

- **What:** a Google Apps Script in your Google account, **Monday League Reminders** (script.google.com). Every day at 6 PM Toronto time it checks whether tomorrow is a league Monday. If so, it emails each booked player their bay, time, course and who they're playing with, plus a **"Can't make it? Remove me"** button. You get a roster summary, and a separate email whenever someone removes themselves.
- **Remove-me page:** a web app at `https://script.google.com/macros/s/AKfycby96bCO3tur0I-mqqFo_nz-imVI2_fnxieN0t8IqCErIPzRq21N_akq3q4b4Uqp8Sesjw/exec`. Each button carries a private code tied to that player and that Monday, so links can't be forged or reused for someone else. Opening the link only shows a confirm page; nothing changes until the player taps **Yes, remove me**, so email link-scanners can't remove anyone. Links expire after the Monday.
- **Sends from:** your Gmail (beaudette356@gmail.com). Google allows 100 recipients a day from Apps Script on a personal account; a full league night is at most 16 players plus your summary.
- **Handy functions (Run in the editor):** `previewReminders` lists who would be emailed for the next league Monday without sending anything; `sendTestToMe` emails you a sample.
- **If you change the Remove-me page code** (`doGet`, `removeMe`, `Remove.html`), publish it via **Deploy › Manage deployments › Edit › New version**. The daily email job always uses the latest saved code.
- **To pause reminders:** Apps Script › Triggers (clock icon) › delete the `sendReminders` trigger. Run `setup` again to bring it back.

## Announcements, waitlist and home-screen app (added Nov 26, 2026)

- **Announcement banner:** Admin › Messages › Announcement banner. Shows at the top of the booking page and inside the 6 PM reminder emails. "Take it down" hides it.
- **Email all players:** Admin › Messages › Email all players. Queued, then sent within about 5 minutes from your Gmail, one email per player (replies come to you). Gmail allows about 100 emails a day; the script keeps 25 in reserve for reminders and finishes a big send the next day if it runs out. "Recent emails" shows the status.
- **Waitlist:** when a bay is full, players see "Full · Join the waitlist". When a spot opens (someone leaves on the site, uses Remove me, moves bays, or you remove them in Admin), everyone on that bay's waitlist gets a "Take the spot" email. First to tap gets it; they're moved out of any other bay that night and you get an email. Each person hears about the same bay at most once every 20 minutes.
- **No waitlist?** If a spot opens within 3 days of the Monday and nobody is waiting, players not booked that night get one heads-up email per Monday.
- **Home-screen app:** "Add to phone" button on the booking page. Android/Chrome installs directly; iPhone shows the Safari Share › Add to Home Screen steps.
- **Behind the scenes:** a `processQueue` trigger runs every 5 minutes in the "Monday League Reminders" Apps Script. The web app is on version 2 (same address). New database collections: `config`, `waitlist`, `openings`, `broadcasts`, covered by the updated rules.

## Ideas for later (from the BenchApp comparison, Nov 26, 2026)

1. ~~Announcements + email all players~~ (done Nov 26)
2. ~~"A spot just opened" alerts + waitlist~~ (done Nov 26)
3. **Dues tracking:** a Paid column in Admin › Players (amount, method, date) for e-Transfers and cash. Skip online card payments.
4. **Scores and standings:** weekly gross/handicap/net entry and a season leaderboard. Biggest build; depends on the season format.
5. ~~Home-screen app~~ (done Nov 26)
