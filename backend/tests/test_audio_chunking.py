"""
Unit tests for audio chunking logic.
Tests that audio is split correctly for transcription.
"""
import pytest
from typing import List


def chunk_audio(audio_data: bytes, chunk_size_bytes: int = 1024 * 1024) -> List[bytes]:
    """
    Split audio data into chunks of specified size.

    Args:
        audio_data: Raw audio bytes
        chunk_size_bytes: Chunk size in bytes (default 1MB)

    Returns:
        List of audio chunks
    """
    # Split audio into chunks of specified size
    return [audio_data[i:i + chunk_size_bytes] for i in range(0, len(audio_data), chunk_size_bytes)]


def test_audio_chunking_10_minute_audio():
    """Verify audio chunking function handles large files."""
    # 10MB of audio with 1MB chunks = 10 chunks
    ten_minute_audio = b"x" * (10 * 1024 * 1024)

    chunks = chunk_audio(ten_minute_audio, chunk_size_bytes=1024 * 1024)  # 1MB chunks

    # 10MB / 1MB = 10 chunks
    assert len(chunks) == 10


def test_audio_chunking_partial_last_chunk():
    """Verify partial audio at end creates smaller chunk."""
    # 2.5MB of audio with 1MB chunks = 3 chunks (1 + 1 + 0.5)
    audio = b"x" * (2 * 1024 * 1024 + 512 * 1024)

    chunks = chunk_audio(audio, chunk_size_bytes=1024 * 1024)  # 1MB chunks

    assert len(chunks) == 3
    # Last chunk should be smaller
    assert len(chunks[2]) < len(chunks[0])


def test_audio_chunking_empty_input():
    """Verify empty audio returns empty list."""
    chunks = chunk_audio(b"")
    assert chunks == []


def test_audio_chunking_under_chunk_size():
    """Verify audio under chunk size returns single chunk."""
    # 500KB of audio (less than 1MB chunk)
    audio = b"x" * (500 * 1024)

    chunks = chunk_audio(audio, chunk_size_bytes=1024 * 1024)

    assert len(chunks) == 1
    assert len(chunks[0]) == len(audio)


def test_audio_chunking_exact_multiple():
    """Verify audio that exactly matches chunk size."""
    # 3MB = exactly 3 chunks of 1MB
    audio = b"x" * (3 * 1024 * 1024)

    chunks = chunk_audio(audio, chunk_size_bytes=1024 * 1024)

    assert len(chunks) == 3
    # All chunks should be same size
    assert all(len(c) == 1024 * 1024 for c in chunks)


def test_audio_chunking_single_byte():
    """Verify single byte audio."""
    audio = b"x"

    chunks = chunk_audio(audio)

    assert len(chunks) == 1
    assert chunks[0] == b"x"
