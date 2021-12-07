import axios from 'axios';


export const getSummary = async (conversationId, token) => {
    return axios.get(
        `https://api-labs.symbl.ai/v1/conversations/${conversationId}/messages?sentiment=true`,
        {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': `application/json`,
            },
        }
    );
};