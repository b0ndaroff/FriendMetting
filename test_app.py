import database
import server
from datetime import datetime

def test_all():
    print("--- 1. Testing Database Init & Seed ---")
    database.init_db()
    database.seed_sample_data_if_empty()
    meetups = database.get_meetups()
    assert len(meetups) >= 1, "Should have at least 1 seeded meetup"
    print(f"OK: Found {len(meetups)} meetup(s)")

    print("--- 2. Testing Create Meetup with Cafe & Drinks ---")
    new_m = database.create_meetup({
        'title': 'Тест кави у Жовтому навєсіку',
        'date': '2026-10-05',
        'time': '17:00',
        'end_time': '18:30',
        'activity_type': 'cafe',
        'cafe_name': 'Жовтий навєсік',
        'default_drink': 'coffee',
        'is_private': 0,
        'creator_name': 'Максим',
        'creator_avatar': '🦊',
        'initial_note': 'Чекаю всіх біля входу!'
    })
    assert new_m['id'] is not None
    assert new_m['cafe_name'] == 'Жовтий навєсік'
    assert len(new_m['participants']) == 1
    assert len(new_m['notes']) == 1
    print("OK: Created meetup successfully")

    print("--- 3. Testing Adding Participant (RSVP) ---")
    updated_m = database.add_participant(new_m['id'], {
        'name': 'Олена',
        'avatar': '🦄',
        'drink_choice': 'tea',
        'status': 'going'
    })
    assert len(updated_m['participants']) == 2
    olena = [p for p in updated_m['participants'] if p['name'] == 'Олена'][0]
    assert olena['drink_choice'] == 'tea'
    print("OK: Participant added with tea choice")

    print("--- 4. Testing Adding Notes ---")
    updated_m2 = database.add_note(new_m['id'], {
        'author_name': 'Олена',
        'author_avatar': '🦄',
        'content': 'Я візьму до чаю круасани!'
    })
    assert len(updated_m2['notes']) == 2
    print("OK: Note added successfully")

    print("--- 5. Testing .ics Calendar Generation ---")
    ics = server.generate_ics_content(updated_m2)
    assert "BEGIN:VCALENDAR" in ics
    assert "END:VCALENDAR" in ics
    assert "SUMMARY:Тест кави у Жовтому навєсіку" in ics
    assert "Жовтий навєсік" in ics
    print("OK: iCalendar generation valid")

    print("--- 6. Testing Walk and Other activities ---")
    walk_m = database.create_meetup({
        'title': 'Вечірня прогулянка парком',
        'date': '2026-10-06',
        'time': '19:00',
        'activity_type': 'walk',
        'is_private': 1,
        'creator_name': 'Тарас',
        'creator_avatar': '🚀'
    })
    assert walk_m['activity_type'] == 'walk'
    assert walk_m['is_private'] == 1
    print("OK: Walk meetup created successfully")

    print("\n================================")
    print(" ВСІ 6 ТЕСТІВ ПРОЙДЕНО УСПІШНО! ")
    print("================================")

if __name__ == '__main__':
    test_all()
