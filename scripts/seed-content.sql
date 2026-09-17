INSERT OR IGNORE INTO content_limits SELECT id,100,104857600,50 FROM organizations WHERE mode='simulation';
