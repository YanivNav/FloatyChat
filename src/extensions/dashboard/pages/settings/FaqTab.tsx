import React, { type FC, useState, useEffect, useCallback } from 'react';
import { Box, Button, Card, Divider, FormField, Input, Loader, Text } from '@wix/design-system';
import { items } from '@wix/data';
import { dashboard } from '@wix/dashboard';
import { FAQ_COLLECTION_ID } from '../../../../shared/collection-utils';
import type { FaqEntry } from '../../../../shared/types';

interface FaqEntryRowProps {
  entry: FaqEntry;
  onSave: (id: string, question: string, answer: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const FaqEntryRow: FC<FaqEntryRowProps> = ({ entry, onSave, onDelete }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [question, setQuestion] = useState(entry.question);
  const [answer, setAnswer] = useState(entry.answer);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleEdit = () => {
    setQuestion(entry.question);
    setAnswer(entry.answer);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setQuestion(entry.question);
    setAnswer(entry.answer);
    setIsEditing(false);
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave(entry._id!, question.trim(), answer.trim());
    setSaving(false);
    setIsEditing(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    await onDelete(entry._id!);
    setDeleting(false);
  };

  const isDirty = question.trim() !== entry.question || answer.trim() !== entry.answer;

  if (isEditing) {
    return (
      <Box direction="vertical" gap="SP3">
        <FormField label="Question">
          <Input value={question} onChange={(e) => setQuestion(e.target.value)} autoFocus />
        </FormField>
        <FormField label="Answer">
          <Input value={answer} onChange={(e) => setAnswer(e.target.value)} />
        </FormField>
        <Box direction="horizontal" gap="SP2">
          <Button
            size="small"
            onClick={handleSave}
            disabled={saving || !question.trim() || !answer.trim() || !isDirty}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button size="small" priority="secondary" onClick={handleCancel} disabled={saving}>
            Cancel
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box direction="horizontal" verticalAlign="middle" gap="SP3">
      <Box direction="vertical" gap="SP1" style={{ flex: 1, minWidth: 0 }}>
        <Text weight="bold" ellipsis>{entry.question}</Text>
        <Text secondary ellipsis>{entry.answer}</Text>
      </Box>
      <Box direction="horizontal" gap="SP2" flexShrink={0}>
        <Button size="small" priority="secondary" onClick={handleEdit}>
          Edit
        </Button>
        <Button
          size="small"
          priority="secondary"
          skin="destructive"
          onClick={handleDelete}
          disabled={deleting}
        >
          {deleting ? 'Deleting…' : 'Delete'}
        </Button>
      </Box>
    </Box>
  );
};

const FaqTab: FC = () => {
  const [faqEntries, setFaqEntries] = useState<FaqEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');
  const [adding, setAdding] = useState(false);

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
      setFaqEntries((prev) => [...prev, inserted as FaqEntry]);
      setNewQuestion('');
      setNewAnswer('');
      dashboard.showToast({ message: 'FAQ entry added.', type: 'success', timeout: 'normal' });
    } catch {
      dashboard.showToast({ message: 'Failed to add entry. Please try again.', type: 'error', timeout: 'none' });
    } finally {
      setAdding(false);
    }
  }, [newQuestion, newAnswer]);

  const handleSave = useCallback(async (id: string, question: string, answer: string) => {
    try {
      const updated = await items.update(FAQ_COLLECTION_ID, { _id: id, question, answer });
      setFaqEntries((prev) => prev.map((e) => (e._id === id ? (updated as FaqEntry) : e)));
      dashboard.showToast({ message: 'FAQ entry updated.', type: 'success', timeout: 'normal' });
    } catch {
      dashboard.showToast({ message: 'Failed to update entry. Please try again.', type: 'error', timeout: 'none' });
      throw new Error('save failed');
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await items.remove(FAQ_COLLECTION_ID, id);
      setFaqEntries((prev) => prev.filter((e) => e._id !== id));
      dashboard.showToast({ message: 'FAQ entry deleted.', type: 'success', timeout: 'normal' });
    } catch {
      dashboard.showToast({ message: 'Failed to delete entry. Please try again.', type: 'error', timeout: 'none' });
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
            <Box direction="vertical">
              {faqEntries.map((entry, index) => (
                <React.Fragment key={entry._id}>
                  {index > 0 && <Divider />}
                  <Box paddingTop="SP3" paddingBottom="SP3">
                    <FaqEntryRow entry={entry} onSave={handleSave} onDelete={handleDelete} />
                  </Box>
                </React.Fragment>
              ))}
            </Box>
          )}
        </Card.Content>
      </Card>
    </Box>
  );
};

export default FaqTab;
