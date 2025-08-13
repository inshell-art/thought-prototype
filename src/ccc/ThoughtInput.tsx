import React, { useState } from 'react';

type ThoughtInputProps = {
    onConfirm: (thought: string) => void;
};

const ThoughtInput: React.FC<ThoughtInputProps> = ({ onConfirm }) => {
    const [inputValue, setInputValue] = useState('');

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInputValue(e.target.value);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            onConfirm(inputValue);
        }
    };

    return (
        <input id="thought-input"
            placeholder="Type and press Enter"
            maxLength={50}
            value={inputValue}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
        />
    );
};

export default ThoughtInput;
