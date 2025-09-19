class BookSearchService {
    constructor() {
        this.currentTab = 'isbn';
        this.searchHistory = JSON.parse(localStorage.getItem('bookSearchHistory')) || [];

        this.initializeElements();
        this.bindEvents();
        this.updateSearchPlaceholder();
        this.loadSearchHistory();
    }

    initializeElements() {
        this.elements = {
            result: document.getElementById('result'),
            searchInput: document.getElementById('searchInput'),
            searchButton: document.getElementById('searchButton'),
            searchTabs: document.querySelectorAll('.search-tab'),
            languageSelect: document.getElementById('languageSelect'),
            yearSelect: document.getElementById('yearSelect'),
            sortSelect: document.getElementById('sortSelect'),
            searchHistory: document.getElementById('searchHistory'),
            historyItems: document.getElementById('historyItems')
        };
    }

    bindEvents() {
        // Обработчики вкладок
        this.elements.searchTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // Обработчики кнопки поиска и Enter
        this.elements.searchButton.addEventListener('click', () => this.search());
        this.elements.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.search();
        });
    }

    switchTab(tabName) {
        this.currentTab = tabName;

        // Обновляем активную вкладку
        this.elements.searchTabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        this.updateSearchPlaceholder();
    }

    updateSearchPlaceholder() {
        const placeholders = {
            isbn: 'Введите ISBN книги (10 или 13 цифр)',
            title: 'Введите название книги',
            author: 'Введите имя автора',
            keyword: 'Введите ключевые слова'
        };
        this.elements.searchInput.placeholder = placeholders[this.currentTab];
    }

    async search() {
        const query = this.elements.searchInput.value.trim();
        if (!query) {
            this.showError('Пожалуйста, введите поисковый запрос');
            return;
        }

        this.addToHistory(query);
        this.showLoading();

        try {
            let results = [];

            switch (this.currentTab) {
                case 'isbn':
                    results = await this.searchByISBN(query);
                    break;
                case 'title':
                    results = await this.searchByTitle(query);
                    break;
                case 'author':
                    results = await this.searchByAuthor(query);
                    break;
                case 'keyword':
                    results = await this.searchByKeyword(query);
                    break;
            }

            if (results.length > 0) {
                this.displayResults(results);
            } else {
                this.showError('Книги не найдены. Попробуйте изменить запрос');
            }

        } catch (error) {
            this.showError(`Ошибка поиска: ${error.message}`);
        }
    }

    async searchByISBN(isbn) {
        const cleanISBN = isbn.replace(/[^\dX]/gi, '').toUpperCase();

        if (!this.validateISBN(cleanISBN)) {
            throw new Error('Неверный формат ISBN');
        }

        const apis = [
            {
                name: 'Google Books',
                url: `https://www.googleapis.com/books/v1/volumes?q=isbn:${cleanISBN}`,
                parser: this.parseGoogleBooksData.bind(this)
            },
            {
                name: 'OpenLibrary',
                url: `https://openlibrary.org/api/books?bibkeys=ISBN:${cleanISBN}&format=json&jscmd=data`,
                parser: this.parseOpenLibraryData.bind(this)
            }
        ];

        for (const api of apis) {
            try {
                const data = await this.fetchData(api.url);
                const result = api.parser(data, cleanISBN);
                if (result) return [result];
            } catch (error) {
                console.warn(`Ошибка в ${api.name}:`, error);
            }
        }

        return [];
    }

    async searchByTitle(title) {
        const url = `https://www.googleapis.com/books/v1/volumes?q=intitle:${encodeURIComponent(title)}&maxResults=20`;
        const data = await this.fetchData(url);
        return this.parseGoogleBooksResults(data);
    }

    async searchByAuthor(author) {
        const url = `https://www.googleapis.com/books/v1/volumes?q=inauthor:${encodeURIComponent(author)}&maxResults=20`;
        const data = await this.fetchData(url);
        return this.parseGoogleBooksResults(data);
    }

    async searchByKeyword(keyword) {
        const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(keyword)}&maxResults=20`;
        const data = await this.fetchData(url);
        return this.parseGoogleBooksResults(data);
    }

    async fetchData(url) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        try {
            const response = await fetch(url, {
                signal: controller.signal,
                headers: { 'Accept': 'application/json' },
                credentials: 'omit'
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }

    parseGoogleBooksData(data, isbn) {
        if (data.items && data.items.length > 0) {
            const item = data.items[0];
            const volume = item.volumeInfo;

            return {
                title: volume.title,
                authors: volume.authors || ['Неизвестен'],
                publishDate: volume.publishedDate,
                publisher: volume.publisher,
                isbn: isbn,
                pages: volume.pageCount,
                cover: volume.imageLinks?.thumbnail,
                description: volume.description,
                language: volume.language,
                categories: volume.categories,
                source: 'Google Books'
            };
        }
        return null;
    }

    parseOpenLibraryData(data, isbn) {
        const bookKey = `ISBN:${isbn}`;
        if (data[bookKey]) {
            const book = data[bookKey];
            return {
                title: book.title,
                authors: book.authors?.map(a => a.name) || ['Неизвестен'],
                publishDate: book.publish_date,
                publisher: book.publishers?.[0]?.name,
                isbn: isbn,
                pages: book.number_of_pages,
                cover: book.cover?.large,
                description: book.notes || book.description,
                language: book.language,
                source: 'OpenLibrary'
            };
        }
        return null;
    }

    parseGoogleBooksResults(data) {
        if (!data.items) return [];

        return data.items.map(item => {
            const volume = item.volumeInfo;
            const isbn = volume.industryIdentifiers?.[0]?.identifier || '';

            return {
                title: volume.title,
                authors: volume.authors || ['Неизвестен'],
                publishDate: volume.publishedDate,
                publisher: volume.publisher,
                isbn: isbn,
                pages: volume.pageCount,
                cover: volume.imageLinks?.thumbnail,
                description: volume.description,
                language: volume.language,
                categories: volume.categories,
                source: 'Google Books'
            };
        }).filter(book => book.title); // Фильтруем книги без названия
    }

    validateISBN(isbn) {
        const cleanISBN = isbn.replace(/[^\dX]/gi, '').toUpperCase();
        return cleanISBN.length === 10 || cleanISBN.length === 13;
    }

    displayResults(books) {
        if (books.length === 1) {
            this.displaySingleResult(books[0]);
        } else {
            this.displayMultipleResults(books);
        }
    }

    displaySingleResult(book) {
        const html = `
            <div class="success">
                <h3>📖 Книга найдена!</h3>
            </div>
            <div class="book-info">
                ${book.cover ? `
                    <img src="${this.fixCoverUrl(book.cover)}" alt="Обложка" class="book-cover"
                         onerror="this.style.display='none'">
                ` : '<div style="text-align: center; padding: 40px; color: var(--text-light);">📚<br>Нет обложки</div>'}

                <div class="book-details">
                    <h2>${this.escapeHtml(book.title)}</h2>
                    <p><strong>Автор:</strong> ${this.escapeHtml(book.authors.join(', '))}</p>

                    <div class="book-meta">
                        <div class="meta-item">
                            <span class="meta-label">Год издания</span>
                            <span class="meta-value">${book.publishDate || 'Не указан'}</span>
                        </div>
                        <div class="meta-item">
                            <span class="meta-label">Издательство</span>
                            <span class="meta-value">${book.publisher || 'Не указано'}</span>
                        </div>
                        <div class="meta-item">
                            <span class="meta-label">ISBN</span>
                            <span class="meta-value">${book.isbn || 'Не указан'}</span>
                        </div>
                        <div class="meta-item">
                            <span class="meta-label">Страниц</span>
                            <span class="meta-value">${book.pages || 'Не указано'}</span>
                        </div>
                        <div class="meta-item">
                            <span class="meta-label">Язык</span>
                            <span class="meta-value">${this.getLanguageName(book.language) || 'Не указан'}</span>
                        </div>
                        <div class="meta-item">
                            <span class="meta-label">Источник</span>
                            <span class="meta-value">${book.source}</span>
                        </div>
                    </div>

                    ${book.description ? `
                        <div style="margin-top: 20px;">
                            <h4>Описание</h4>
                            <p>${this.truncateText(book.description, 300)}</p>
                        </div>
                    ` : ''}

                    ${book.categories ? `
                        <div style="margin-top: 15px;">
                            <h4>Категории</h4>
                            <p>${book.categories.join(', ')}</p>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;

        this.elements.result.innerHTML = html;
    }

    displayMultipleResults(books) {
        const html = `
            <div class="success">
                <h3>📚 Найдено книг: ${books.length}</h3>
            </div>
            <div class="book-grid">
                ${books.map(book => `
                    <div class="book-card" onclick="bookService.showBookDetails('${this.escapeHtml(JSON.stringify(book))}')">
                        ${book.cover ? `
                            <img src="${this.fixCoverUrl(book.cover)}" alt="Обложка" class="book-card-cover"
                                 onerror="this.style.display='none'">
                        ` : '<div style="text-align: center; padding: 40px; color: var(--text-light);">📚<br>Нет обложки</div>'}

                        <div class="book-card-title">${this.escapeHtml(book.title)}</div>
                        <div class="book-card-author">${this.escapeHtml(book.authors.join(', '))}</div>
                        <div style="font-size: 0.8rem; color: var(--text-light);">
                            ${book.publishDate ? `Год: ${book.publishDate}` : ''}
                            ${book.publisher ? ` • ${book.publisher}` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        this.elements.result.innerHTML = html;
    }

    showBookDetails(bookJson) {
        const book = JSON.parse(bookJson);
        this.displaySingleResult(book);
    }

    fixCoverUrl(url) {
        if (!url) return '';
        return url
            .replace('http://', 'https://')
            .replace('&edge=curl', '')
            .replace('zoom=1', 'zoom=2');
    }

    getLanguageName(code) {
        const languages = {
            'ru': 'Русский',
            'en': 'Английский',
            'de': 'Немецкий',
            'fr': 'Французский',
            'es': 'Испанский',
            'it': 'Итальянский',
            'zh': 'Китайский',
            'ja': 'Японский'
        };
        return languages[code] || code;
    }

    showLoading() {
        this.elements.result.innerHTML = `
            <div class="loading">
                <div class="loading-spinner"></div>
                <h3>Ищем книги...</h3>
                <p>Пожалуйста, подождите</p>
            </div>
        `;
    }

    showError(message) {
        this.elements.result.innerHTML = `
            <div class="error">
                <h3>⚠️ Ошибка</h3>
                <p>${this.escapeHtml(message)}</p>
            </div>
        `;
    }

    addToHistory(query) {
        if (!query) return;

        // Удаляем дубликаты
        this.searchHistory = this.searchHistory.filter(item => item !== query);

        // Добавляем в начало
        this.searchHistory.unshift(query);

        // Ограничиваем историю 10 элементами
        this.searchHistory = this.searchHistory.slice(0, 10);

        // Сохраняем в localStorage
        localStorage.setItem('bookSearchHistory', JSON.stringify(this.searchHistory));

        this.loadSearchHistory();
    }

    loadSearchHistory() {
        if (this.searchHistory.length === 0) {
            this.elements.searchHistory.style.display = 'none';
            return;
        }

        this.elements.searchHistory.style.display = 'block';
        this.elements.historyItems.innerHTML = this.searchHistory.map(query => `
            <div class="history-item" onclick="bookService.useHistoryQuery('${this.escapeHtml(query)}')">
                ${this.escapeHtml(query)}
            </div>
        `).join('');
    }

    useHistoryQuery(query) {
        this.elements.searchInput.value = query;
        this.search();
    }

    escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    truncateText(text, maxLength) {
        if (!text) return '';
        if (text.length <= maxLength) return this.escapeHtml(text);
        return this.escapeHtml(text.substring(0, maxLength)) + '...';
    }
}

// Инициализация сервиса
let bookService = null;
document.addEventListener('DOMContentLoaded', () => {
    bookService = new BookSearchService();
});
