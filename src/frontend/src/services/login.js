import axios from 'axios';

export const loginProfessor = async (data) => {
  const res = await axios.post('/api/auth/login', data);
  return res.data;
};
