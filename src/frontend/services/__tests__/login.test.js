import axios from 'axios';
import { loginProfessor } from '../login';

jest.mock('axios');

describe('loginProfessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('posts credentials to /api/auth/login and returns the response data', async () => {
    const responseData = { access_token: 'tok123', professor: { name: 'Khoa Ho' } };
    axios.post.mockResolvedValue({ data: responseData });

    const result = await loginProfessor({ email: 'khoa@example.com', password: 'secret' });

    expect(axios.post).toHaveBeenCalledWith('/api/auth/login', {
      email: 'khoa@example.com',
      password: 'secret',
    });
    expect(result).toEqual(responseData);
  });

  it('propagates errors from the request', async () => {
    axios.post.mockRejectedValue(new Error('Network Error'));

    await expect(loginProfessor({ email: 'a@b.com', password: 'x' })).rejects.toThrow('Network Error');
  });
});
