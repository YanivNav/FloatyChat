import React, { type FC, useState, useEffect, useCallback } from 'react';
import { Box, Button, Card, FormField, Input, Loader, Text } from '@wix/design-system';
import { items } from '@wix/data';
import { FAQ_COLLECTION_ID } from '../../../../shared/collection-utils';
import type { FaqEntry } from '../../../../shared/types';

const FaqTab: FC = () => {
  const [faqEntries, setFaqEntries] = useState<FaqEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    items.query(FAQ_COLLECTION_ID).find()
      .then(({ items: results }) => setFaqEntries(results as FaqEntry[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleAdd = useCallback(async () => {
    if (!newQuestion.trim() || !newAnswer.trim()) return;
    setAdding(true);
    try {
      const inserted = await items.insert(FAQ_COLLECTION_ID, { question: newQuestion.trim(), answer: newAnswer.trim() });
      setFaqEntries((prev) => [inserted as FaqEntry, ...prev]);
      setNewQuestion('');
      setNewAnswer('');
    } finally {
      setAdding(false);
    }
  }, [newQuestion, newAnswer]);

  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      await items.remove(FAQ_COLLECTION_ID, id);
      setFaqEntries((prev) => prev.filter((e) => e._id !== id));
    } finally {
      setDeletingId(null);
    }
  }, []);

  return (
    <Box direction="vertical" gap="SP4">
      <Card>
        <Card.Header title="Add FAQ Entry" />
        <Card.Content>
          <Box direction="vertical" gap="SP4">
            <FormField label="Question">
              <Input
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                placeholder="e.g. What is your return policy?"
              />
            </FormField>
            <FormField label="Answer">
              <Input
                value={newAnswer}
                onChange={(e) => setNewAnswer(e.target.value)}
                placeholder="e.g. We accept returns within 30 days of purchase."
              />
            </FormField>
            <Box>
              <Button onClick={handleAdd} disabled={adding || !newQuestion.trim() || !newAnswer.trim()}>
                {adding ? 'Adding…' : 'Add Entry'}
              </Button>
            </Box>
          </Box>
        </Card.Content>
      </Card>
      <Card>
        <Card.Header title={`Existing Entries (${faqEntries.length})`} />
        <Card.Content>
          {loading ? (
            <Box align="center" paddingTop="SP6">
              <Loader size="medium" />
            </Box>
          ) : faqEntries.length === 0 ? (
            <Text secondary>No FAQ entries yet. Add your first one above.</Text>
          ) : (
            <Box direction="vertical" gap="SP4">
              {faqEntries.map((entry) => (
                <Box key={entry._id} direction="vertical" gap="SP2" border="standard" borderRadius="8px" padding="SP3">
                  <Text weight="bold">{entry.question}</Text>
                  <Text secondary>{entry.answer}</Text>
                  {entry._id && (
                    <Box>
                      <Button
                        priority="secondary"
                        skin="destructive"
                        size="small"
                        onClick={() => handleDelete(entry._id!)}
                        disabled={deletingId === entry._id}
                      >
                        {deletingId === entry._id ? 'Deleting…' : 'Delete'}
                      </Button>
                    </Box>
                  )}
                </Box>
              ))}
            </Box>
          )}
        </Card.Content>
      </Card>
    </Box>
  );
};

export default FaqTab;
