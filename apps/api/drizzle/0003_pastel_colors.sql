-- İlk sürümün canlı renklerini yeni pastel paletteki karşılıklarına çevirir
UPDATE "envelopes" SET "color" = CASE lower("color")
  WHEN '#e8618c' THEN '#F4A7C4'
  WHEN '#f08a4b' THEN '#F7B49A'
  WHEN '#e9b949' THEN '#F8D66D'
  WHEN '#5bb974' THEN '#A8E6A1'
  WHEN '#3aa6a0' THEN '#8FD9CF'
  WHEN '#4a90d9' THEN '#A7D3F2'
  WHEN '#7b6cd9' THEN '#C7B8F5'
  WHEN '#b765c9' THEN '#C7B8F5'
  WHEN '#8d8d8d' THEN '#E3C9A8'
  WHEN '#c46a4a' THEN '#F7B49A'
  ELSE "color" END;
--> statement-breakpoint
UPDATE "goals" SET "color" = CASE lower("color")
  WHEN '#e8618c' THEN '#F4A7C4'
  WHEN '#f08a4b' THEN '#F7B49A'
  WHEN '#e9b949' THEN '#F8D66D'
  WHEN '#5bb974' THEN '#A8E6A1'
  WHEN '#3aa6a0' THEN '#8FD9CF'
  WHEN '#4a90d9' THEN '#A7D3F2'
  WHEN '#7b6cd9' THEN '#C7B8F5'
  WHEN '#b765c9' THEN '#C7B8F5'
  WHEN '#8d8d8d' THEN '#E3C9A8'
  WHEN '#c46a4a' THEN '#F7B49A'
  ELSE "color" END;
