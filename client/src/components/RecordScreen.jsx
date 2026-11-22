import React, { useState, useCallback } from 'react';
import { useRecorder } from '../hooks/useRecorder';
import { formatIndian, describeSaved } from '../utils/format';

export default function RecordScreen({ netBalance, totalIncome, totalSpend, onUploadAudio, currencySymbol = '₹' }) {
  const [statusText, setStatusText] = useState('Tap to record a transaction');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleRecordingComplete = useCallback(async (blob, ext) => {
    setStatusText('Processing your transaction...');
    setIsProcessing(true);
    try {
      // The upload resolves with the saved transaction; failures throw with the API's reason.
      const saved = await onUploadAudio(blob, ext);
      if (saved?.id) {
        setStatusText(describeSaved(saved, currencySymbol));
        setTimeout(() => setStatusText('Tap to record a transaction'), 4000);
      } else {
        setStatusText('Failed to process. Try again.');
      }
    } catch (err) {
      setStatusText(err.response?.data?.error || 'Failed to process. Try again.');
    } finally {
      setIsProcessing(false);
    }
  }, [onUploadAudio, currencySymbol]);

  const { isRecording, toggleRecording } = useRecorder(handleRecordingComplete);

  return (
    <div className="record-screen fade-in">
      <header>
        <h1>Sense<span className="highlight">Ledger</span></h1>
        <p>Your AI-powered voice expense manager</p>
      </header>

      <div className="balance-card">
        <h3>Net Balance</h3>
        <h2>{netBalance >= 0 ? '+' : '-'}{currencySymbol}{formatIndian(netBalance)}</h2>
        <div className="balance-stats">
          <div className="balance-stat">
            <span className="balance-stat-label">Income</span>
            <span className="balance-stat-value">+{currencySymbol}{formatIndian(totalIncome)}</span>
          </div>
          <div className="balance-stat">
            <span className="balance-stat-label">Expense</span>
            <span className="balance-stat-value">-{currencySymbol}{formatIndian(totalSpend)}</span>
          </div>
        </div>
      </div>

      <div className="mic-section">
        <div className="mic-container">
          <button className={`mic-btn ${isRecording ? 'recording' : ''}`} onClick={toggleRecording}>
            <i className={`fa-solid ${isRecording ? 'fa-stop' : 'fa-microphone'}`}></i>
          </button>
          <div className="pulse-ring"></div>
        </div>
        <p className={`status-text ${isProcessing ? 'processing' : ''}`}>{statusText}</p>
      </div>
    </div>
  );
}
