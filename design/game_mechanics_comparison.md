# Rogue: DungeonMaster - Game Mechanics Comparison & Research

This document outlines and compares the core gameplay mechanics of the original **Rogue (1980)**, subsequent classic and modern **Roguelikes/Roguelites** (such as *NetHack*, *Angband*, *ADOM*, *DCSS*, and modern titles), and the current implementation in **Rogue: DungeonMaster**. Use this as a reference and exploration guide for deciding what to build next.

---

## Legend

*   **[Original Rogue]**: Present in the original 1980 game.
*   **[Subsequent Roguelikes]**: Introduced or popularized in later classic/modern games (NetHack, Angband, ADOM, DCSS, or Roguelites).
*   **[Implemented]**: Already fully present in the *Rogue: DungeonMaster* codebase.
*   **[Partial]**: Partially implemented (missing sub-features or only wired up in data/tests).
*   **[Unimplemented]**: Completely missing from the codebase.

---

## 1. Dungeon Generation & Environmental Systems

### 1.1. Grid-Based Room Generation
*   **[Original Rogue]** **[Implemented]** Lays out rooms in a 3x3 grid, preventing room overlapping. Passages (corridors) link neighboring cells. Some grid cells contain "gone rooms" (collapsed rooms reduced to simple corridor junctions).
*   **[Rogue: DungeonMaster]** Uses the classic 3x3 grid generation with rooms, corridor linkages, gone rooms, and loop-forming extra passages configured in `BALANCE.map`.

### 1.2. Dark Rooms & Dynamic Lighting
*   **[Original Rogue]** **[Unimplemented]** Floors could have dark rooms. In a dark room, the player can only see their immediate neighboring 8 tiles. Illuminating a dark room requires a Scroll of Light or Wand of Light.
*   **[Rogue: DungeonMaster]** Uses a raycasting Field of View (FOV) system (72 rays) where all rooms are lit, but spaces outside the player's sight are shrouded in fog of war.

### 1.3. Secret Doors & Corridors
*   **[Original Rogue]** **[Implemented]** Hidden doors and secret passages are placed in walls. Players must stand adjacent and manually use the Search (`s`) command to reveal them, often requiring multiple attempts.
*   **[Rogue: DungeonMaster]** Implements candidate secret door generation and placement. Players press `Space` to search adjacent tiles to reveal secret doors.

### 1.4. Dungeon Traps
*   **[Original Rogue]** **[Unimplemented]** Hidden trap tiles on the floor (Bear Traps, Sleep Gas, Dart Traps that drain strength, Teleport Traps, Trapdoors that drop the player to the next floor). Revealed by stepping on them or via searching.
*   **[Subsequent Roguelikes]** Added complex traps, trap disarming skills, and utilizing traps against monsters.
*   **[Rogue: DungeonMaster]** *No physical traps exist on the map.* Traps are represented only by "Trap Scrolls" that trigger immediate damage when picked up.

### 1.5. Ascent/Descent & Floor Progression
*   **[Original Rogue]** **[Unimplemented]** Standard descent via stairs down (`>`). Once the objective is retrieved, the player must ascend back to Floor 1 using stairs up (`<`) to win.
*   **[Rogue: DungeonMaster]** Only supports descending. Stairs up (`<`) exist visually in the game but are decorative; there is no ascent mechanic. The game ends on Floor 20 upon defeating the bosses.

---

## 2. Character Stats, Attributes, & Progression

### 2.1. Standard Attributes & Leveling
*   **[Original Rogue]** **[Implemented]** Has Hit Points (HP), Strength, Experience (XP/Level), and Gold. Leveling up increases Max HP and improves D&D-style saving throws/to-hit rolls.
*   **[Rogue: DungeonMaster]** Tracks HP, XP, Level, Gold, and Hunger. Leveling up scales Max HP based on `BALANCE.player.levelUpHpMultiplier`.

### 2.2. Hunger & Starvation
*   **[Original Rogue]** **[Implemented]** Movements drain nutrition. Hunger states progress from *Content* $\rightarrow$ *Hungry* $\rightarrow$ *Weak* $\rightarrow$ *Fainting* (temporary paralysis turns) $\rightarrow$ *Death by Starvation*. Eating food (rations) restores nutrition.
*   **[Rogue: DungeonMaster]** Has a hunger meter draining by 1 unit per turn. If hunger hits 0, the player takes 1 damage per turn ("Starving!"). Eating rations restores hunger. Max food carried is limited by a tunable capacity.

### 2.3. Character Races & Classes
*   **[Original Rogue]** **[Unimplemented]** No classes or races. Every player starts as a generic fighter.
*   **[Subsequent Roguelikes]** *Moria/Angband*, *ADOM*, and *DCSS* added rich sets of races (Elves, Dwarves, Orcs, etc.) and classes (Mage, Priest, Rogue, Warrior), drastically altering starting gear, stat growth, and abilities.
*   **[Rogue: DungeonMaster]** No classes or races. The player starts with identical stats, customized only by gear.

---

## 3. Item Systems (Weapons, Armor, Consumables, Magic)

### 3.1. Gear Slots & Enchantments
*   **[Original Rogue]** **[Partial]** Simple gear slots: wielded Weapon and worn Armor. Equipment can be enchanted (e.g. $+1, +2$) to increase accuracy/damage or defense.
*   **[Subsequent Roguelikes]** Added numerous gear slots (helm, gloves, boots, cloaks, amulets, multiple rings) and prefixes/suffixes for loot (*Angband/Moria* model).
*   **[Rogue: DungeonMaster]** Highly expanded gear slots compared to original Rogue: Weapon (1H/2H), Shield, Helm, Chest, Legs, Gauntlets, and Boots. Items scale via a rarity system (Common to Legendary) and floor-based bonuses.

### 3.2. Rings & Ring Upkeep
*   **[Original Rogue]** **[Unimplemented]** Left and right ring slots. Rings provide powerful buffs (Stealth, Slow Digestion, Gain Strength, See Invisible) but accelerate hunger rate (increased food upkeep per turn).
*   **[Rogue: DungeonMaster]** No ring slots or hunger-drain upkeep accessories exist.

### 3.3. Wands, Staves, & Charge-Based Casting
*   **[Original Rogue]** **[Partial]** Wands and staves are ranged items with a set number of charges. Zapping them shoots a projectile (Magic Missile, Teleport Monster, Polymorph, Cancellation). Charges are finite but can be recharged.
*   **[Rogue: DungeonMaster]** Magic staffs (Fire, Frost, Arcane) exist as weapons equipped in the weapon slot rather than charge-based consumables. Staff attacks trigger special effects (frost freeze, arcane heal) but do not use charges.

### 3.4. Item Identification System
*   **[Original Rogue]** **[Unimplemented]** Items spawn unidentified (e.g., "a magenta potion" or "a scroll titled 'FOO BAR'"). The player must identify them by quaffing/reading them (taking risks), using a Scroll of Identify, or calling/naming them based on deductive reasoning.
*   **[Subsequent Roguelikes]** Deepened the system (cursed items, identification levels). *DCSS* removed identification grinding to reduce player tedium.
*   **[Rogue: DungeonMaster]** All items spawn fully identified upon pickup (e.g. "Potion of Strength", "Shortsword"). There is no identification system.

### 3.5. Cursed Equipment
*   **[Original Rogue]** **[Unimplemented]** Some weapons, armor, and rings spawn cursed. Once equipped, they cannot be unequipped until a Scroll of Remove Curse or Scroll of Enchantment is used. Cursed items often have negative modifiers (e.g., $-1$ armor).
*   **[Rogue: DungeonMaster]** No cursed items or equip-locking mechanics.

### 3.6. Item Customization & Interactions (Systems Chemistry)
*   **[Subsequent Roguelikes]** *NetHack* is legendary for this: dipping items into potions (e.g., poison arrowheads, diluting potions), blanking scrolls in water, using tins of monster meat, or using markers to write custom scrolls.
*   **[Rogue: DungeonMaster]** Items are purely static. Consumables are clicked to drink/eat, and gear is selected via dropdown menus.

---

## 4. Combat, Special Monster Behaviors, & AI

### 4.1. Melee, Ranged, and Spell Combat
*   **[Original Rogue]** **[Partial]** Simulates physical attacks using hit/miss rolls and damage formulas. Ranged combat consists of throwing weapons (arrows, daggers) or zapping wands.
*   **[Subsequent Roguelikes]** Introduced distinct magic spell systems with mana pools, target templates (beams, explosions), and elemental resistances (Fire, Cold, Acid, Lightning).
*   **[Rogue: DungeonMaster]** Standard turn-based melee bumping. No mana/spell system exists, though staffs trigger elemental status effects.

### 4.2. Special Monster Traits (Alphabet Mechanics)
*   **[Original Rogue]** **[Partial]** Unique monsters had specialized mechanical actions to counter the player:
    *   **Aquator (A)**: Rusts/damages armor, reducing AC permanently.
    *   **Leprechaun (L)**: Steals gold on hit and teleports away.
    *   **Nymph (N)**: Steals a magic item and teleports away.
    *   **Wraith (W)**: Drains an entire experience level.
    *   **Vampire (V)**: Drains max HP.
    *   **Rattlesnake (R)**: Drains Strength stat.
    *   **Ice Monster (I)**: Freezes player in place.
    *   **Xeroc (X)**: Mimics items on the ground.
*   **[Rogue: DungeonMaster]** Includes many of these classic names (Orc, Snake, Leprechaun, Nymph, Troll, Zombie, etc.). However, *most monsters act as standard chase-and-bite enemies*.
    *   *Bat & Eagle*: Erratic skirmisher movement.
    *   *Frost Staff*: Freezes monsters (player action).
    *   *Monsters with theft or stat/level drains are defined in the AI files but not yet active in standard gameplay.*

### 4.3. Monster AI Behaviors & Fleeing
*   **[Original Rogue]** **[Implemented]** Monsters wander randomly when sleeping, wake up when the player gets close or attacks, and chase the player. Some monsters flee when low on health.
*   **[Rogue: DungeonMaster]** Supports several advanced AI archetypes in `src/ai/archetypes.ts`:
    *   `default`: Stand-and-chase.
    *   `skirmisher`: Erratic wobbly movement (Bat, Eagle).
    *   `ambusher`: Wake only at close distance.
    *   `brute`: Heavy slow telegraphed attacks.
    *   `kiter`: Moves away to keep range and shoots.
    *   `trickster`: Flee below 50% HP, attempt to steal and run.
    *   `boss-swiper`: Alternates normal and double-damage swipes (Marcus the Brave).

---

## 5. QoL, Interface, & Meta-Progression

### 5.1. Auto-Explore and Auto-Fight
*   **[Subsequent Roguelikes]** *DCSS* popularized the Auto-Explore (`o`) and Auto-Fight (`Tab`) keys, allowing players to instantly traverse explored rooms and perform trivial combat, reducing repetitive keystrokes.
*   **[Rogue: DungeonMaster]** Has a "Run" action (Shift + Move key) to move until blocked or threatened, but no full auto-explore pathfinder.

### 5.2. Persistent Codex/Compendium
*   **[Subsequent Roguelikes]** Added discovery books or monster wikis integrated directly inside the game interface.
*   **[Rogue: DungeonMaster]** Includes a fully searchable Monsters Compendium (`M` key) which displays monster descriptions, stats, and spawn floors as players discover them.

### 5.3. Visual Tweaking Panel
*   **[Subsequent Roguelikes]** Modern developers build internal tuning tools, but they are rarely user-facing in production.
*   **[Rogue: DungeonMaster]** Features a powerful sidebar config panel allowing players to dynamically tune variables like player starting HP, monster scaling, drop rates, and leveling speed to customize their challenge.

---

## High-Value Mechanics to Explore Adding

If we want to make the game more interesting and align it closer to both the legacy of Rogue and the depth of subsequent roguelikes, we should consider implementing the following:

### 1. The Item Identification System
*   **Why**: Adds tension and decision-making. Testing a potion when low on health could save you (Healing) or kill you (Paralysis/Poison).
*   **How**:
    *   Randomize potion colors and scroll titles per run.
    *   Add an **Identify Scroll** item to the spawn pool.
    *   Hide stats of gear/potions/scrolls until they are used, zapped, or identified.

### 2. Cursed Equipment & Remove Curse
*   **Why**: Introduces high risk to equipping newly found items. Forces players to manage inventory and resources strategically.
*   **How**:
    *   Give items a hidden `cursed` boolean flag on generation.
    *   If equipped, disable the dropdown option to unequip/swap that slot.
    *   Add a **Remove Curse Scroll** that clears the curse on currently equipped gear.

### 3. Physical Floor Traps
*   **Why**: Makes environmental movement and the "Search" command (`Space`) much more vital. Currently, searching is only used for rare secret doors.
*   **How**:
    *   Generate hidden traps (bear trap, dart trap, trapdoor) on floor tiles during map creation.
    *   Make them invisible until stepped on or revealed by searching.
    *   Stepping on them inflicts status effects (Immobilized, Weakened, dropped to next floor).

### 4. Fully Activate Special Monster Behaviors
*   **Why**: Makes combat highly tactical. Instead of just bumping every enemy, players must change weapons or prioritize targets.
*   **How**:
    *   **Aquator**: Wire up armor rusting. On hit, reduce the durability/defense of a random equipped armor piece by 1.
    *   **Leprechaun / Nymph**: Assign them the `trickster` AI archetype. On attack, steal gold or a random inventory item and immediately pathfind away from the player.
    *   **Vampire / Wraith**: Apply max HP reduction or level draining status effects on hit.
