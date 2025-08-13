import React from 'react';

type ThoughtTextProps = {
    thought: string;
};

const ThoughtText: React.FC<ThoughtTextProps> = ({ thought }) => {
    return (
        <div
            style={{
                position: 'absolute',
                zIndex: 999,
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                fontSize: '30px',
                fontFamily: 'Arial',
                fontWeight: 'bold',
                color: 'black',
                textAlign: 'center',
            }}
        >
            {thought}
        </div>
    );
};

export default ThoughtText;