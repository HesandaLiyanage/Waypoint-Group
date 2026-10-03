package ordering

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

func TestVerifyReceiptCode(t *testing.T) {
	code := "482910"
	salt := "test-salt-secret-1234"

	// Generate valid HMAC-SHA256
	h := hmac.New(sha256.New, []byte(salt))
	h.Write([]byte(code))
	expectedHash := hex.EncodeToString(h.Sum(nil))

	// Valid code
	assert.True(t, VerifyReceiptCode(code, salt, expectedHash))

	// Wrong code
	assert.False(t, VerifyReceiptCode("123456", salt, expectedHash))

	// Wrong salt
	assert.False(t, VerifyReceiptCode(code, "wrong-salt", expectedHash))
}

func TestFreshSplitOrderDeterministicUUID(t *testing.T) {
	baseID := uuid.MustParse("01923456-789a-7def-8123-456789abcdef")

	// Chilled order split ID generated deterministically from baseID
	chilledID1 := uuid.NewMD5(baseID, []byte("chilled_split"))
	chilledID2 := uuid.NewMD5(baseID, []byte("chilled_split"))

	assert.Equal(t, chilledID1, chilledID2, "Chilled order split ID must be deterministic")
	assert.NotEqual(t, baseID, chilledID1, "Chilled order split ID must differ from ambient base ID")
}
