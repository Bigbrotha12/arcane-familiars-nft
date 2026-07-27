-- Seed data: Generation 1 familiars and abilities
-- Based on original game data schemas

INSERT OR IGNORE INTO familiars (familiar_id, name, description, image, affinity, hp, mp, attack, defense, arcane, speed, ability_1, ability_2, ability_3, ability_4, rarity, generation)
VALUES 
(1, 'WhiteDog', 'A loyal canine companion imbued with celestial light. Its presence brings warmth and courage to allies.', '0001.png', 'Light', 120, 80, 55, 70, 45, 60, 'Brave', 'Sturdy', '', '', 'common', 1),
(2, 'YellowFighter', 'A fierce warrior spirit crackling with electric energy. Nothing can stand in its way when it enters the fray.', '0002.png', 'Fire', 140, 60, 80, 45, 35, 75, 'Brave', '', '', '', 'uncommon', 1);

INSERT OR IGNORE INTO abilities (ability_id, name, description, effect, drawback)
VALUES 
(1, 'Brave', 'Boosts attack power when HP is low, allowing the familiar to fight with renewed determination.', '["attack_boost_50%_when_hp_below_30%"]', '["no_drawback"]'),
(2, 'Sturdy', 'Strengthens defense, reducing incoming damage and making the familiar harder to defeat.', '["defense_boost_25%_passive"]', '["speed_reduced_10%"]');
