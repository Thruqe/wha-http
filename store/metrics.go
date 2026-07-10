package store

type MetricEvent struct {
	ID        int64  `json:"id"`
	UserID    string `json:"userId"`
	AccountID string `json:"accountId"`
	EventType string `json:"eventType"`
	Timestamp int64  `json:"timestamp"`
}

type StatData struct {
	ConnectedCount    int            `json:"connectedCount"`
	DisconnectedCount int            `json:"disconnectedCount"`
	TotalAccounts     int            `json:"totalAccounts"`
	EventCounts       map[string]int `json:"eventCounts"`
}

func RecordMetric(userID, accountID, eventType string) error {
	_, err := DB.Exec(
		`INSERT INTO metrics (user_id, account_id, event_type) VALUES (?, ?, ?)`,
		userID, accountID, eventType,
	)
	return err
}

func GetStats(userID string) (*StatData, error) {
	stats := &StatData{
		EventCounts: make(map[string]int),
	}

	// 1. Get account states counts
	rows, err := DB.Query(`SELECT status, COUNT(*) FROM wa_accounts WHERE user_id = ? GROUP BY status`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var status string
		var count int
		if err := rows.Scan(&status, &count); err != nil {
			return nil, err
		}
		stats.TotalAccounts += count
		if status == "connected" {
			stats.ConnectedCount = count
		} else {
			stats.DisconnectedCount += count
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// 2. Get event counts
	mRows, err := DB.Query(`SELECT event_type, COUNT(*) FROM metrics WHERE user_id = ? GROUP BY event_type`, userID)
	if err != nil {
		return nil, err
	}
	defer mRows.Close()

	for mRows.Next() {
		var evt string
		var count int
		if err := mRows.Scan(&evt, &count); err != nil {
			return nil, err
		}
		stats.EventCounts[evt] = count
	}
	if err := mRows.Err(); err != nil {
		return nil, err
	}

	return stats, nil
}
